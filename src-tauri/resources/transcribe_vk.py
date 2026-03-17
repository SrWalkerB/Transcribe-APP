import os
import argparse
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("mp3_name", help="Nome do arquivo MP3")
parser.add_argument("mp3_path", help="Caminho absoluto do MP3")
parser.add_argument("--model", default="base", choices=["tiny", "base", "small", "medium", "large", "turbo"])
parser.add_argument("--threads", type=int, default=4)
args = parser.parse_args()

# whisper.cpp doesn't have "turbo" model - map to large-v3
model_name = "large-v3" if args.model == "turbo" else args.model

file_name = "./output-text/{}.txt".format(args.mp3_name)

# Get audio duration via ffprobe for progress calculation
duration = 0.0
try:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", args.mp3_path],
        capture_output=True, text=True, timeout=10
    )
    duration = float(result.stdout.strip())
except Exception:
    pass

from pywhispercpp.model import Model

model = Model(model_name, n_threads=args.threads)

print("__DURATION__:%.2f" % duration, flush=True)

detected_lang = None

def on_segment(segment):
    global detected_lang
    start_sec = segment.t0 / 100.0
    end_sec = segment.t1 / 100.0
    text = segment.text.strip()

    if not text:
        return

    # Try to detect language from first segment
    if detected_lang is None:
        try:
            detected_lang = model.context.full_lang_id()
        except Exception:
            detected_lang = ""
        if detected_lang:
            print("__LANG__:%s" % detected_lang, flush=True)

    line = "[%.2fs -> %.2fs] %s" % (start_sec, end_sec, text)
    print("__SEG__:%.2f|%s" % (end_sec, text), flush=True)

    with open(file_name, "a") as file:
        file.write(line + "\n")

segments = model.transcribe(args.mp3_path, new_segment_callback=on_segment)

# If no callback was fired (shouldn't happen), process segments normally
if not os.path.exists(file_name):
    for segment in segments:
        start_sec = segment.t0 / 100.0
        end_sec = segment.t1 / 100.0
        text = segment.text.strip()
        if not text:
            continue
        line = "[%.2fs -> %.2fs] %s" % (start_sec, end_sec, text)
        print("__SEG__:%.2f|%s" % (end_sec, text), flush=True)
        with open(file_name, "a") as file:
            file.write(line + "\n")

print("__DONE__", flush=True)

# Transcribe App

App desktop para transcrever videos usando IA (faster-whisper). Tauri 2 (Rust) + React + Python.

## Comandos

```bash
pnpm install          # instalar dependencias frontend
pnpm tauri dev        # rodar em modo dev
pnpm tauri build      # build completo (todos os targets)
pnpm build:linux      # build linux (deb, rpm, appimage)
pnpm build:windows    # build windows (msi, nsis)
pnpm build:mac        # build mac (dmg)
cargo check           # verificar compilacao do Rust (rodar dentro de src-tauri/)
```

## Arquitetura

```
Video -> FFmpeg (extrai audio MP3) -> Python/faster-whisper (transcreve) -> Texto
```

O Rust orquestra o processo, emitindo eventos em tempo real para o frontend via Tauri events.

### Backend (Rust) - `src-tauri/src/lib.rs`

**Tauri commands (invocados pelo frontend via `invoke()`):**
- `transcribe_video(path, model, threads, device)` - async, roda em `spawn_blocking`. `device` pode ser "cpu" ou "cuda"
- `check_dependencies()` - verifica ffmpeg, python3, faster-whisper
- `install_dependencies()` - async, tenta pip --user, --break-system-packages, pipx
- `detect_gpu()` - async, detecta GPU NVIDIA (nvidia-smi) ou AMD (lspci + amdgpu driver). Retorna `GpuInfo { available, gpu_type, name, libs_installed }`
- `install_cuda_dependencies()` - async, instala nvidia-cublas-cu12 + nvidia-cudnn-cu12 via pip (NVIDIA)
- `install_vulkan_dependencies()` - async, instala pywhispercpp com Vulkan via pip (AMD)
- `get_video_duration(path)` - usa ffprobe
- `get_cpu_count()` - retorna threads disponiveis
- `cancel_transcription()` - mata o processo Python via `child.kill()`

**Funcoes auxiliares importantes:**
- `resolve_command(name)` - busca binarios em paths comuns (/opt/homebrew/bin, /usr/local/bin, etc). Necessario porque apps GUI no macOS nao herdam o PATH do terminal. No AppImage, pula binarios embutidos via `canonicalize()`.
- `python_command(bin)` - cria Command limpando PYTHONHOME/PYTHONPATH dentro de AppImage (o AppImage seta essas vars apontando pro filesystem read-only interno).
- `resolve_python(script_path)` - tenta venv do backend primeiro, depois `resolve_command("python3")`.
- `backend_venv_python(script_path)` - procura `backend/.venv/bin/python3` subindo ate 8 niveis de diretorio.

**Estado compartilhado:**
- `TranscribeProcess(Arc<Mutex<Option<Child>>>)` - armazena o processo Python para cancel imediato.

**Protocolo Python->Rust (stdout streaming):**
- `__DURATION__:<float>` - duracao total do audio
- `__LANG__:<string>` - idioma detectado
- `__SEG__:<end_time>|<text>` - segmento transcrito (usado pra barra de progresso)
- `__DONE__` - transcricao concluida

**Cancelamento:**
- Retorna `Err("__CANCELLED__<texto_parcial>")` - frontend detecta o prefixo e exibe resultado parcial.

### Frontend (React) - `src/`

**Componentes:**
- `App.tsx` - componente principal, state machine: settings -> idle -> loading -> done -> error -> history
- `VideoUploader.tsx` - upload de video, grid de modelos (tiny/base/small/medium/large/turbo), opcoes avancadas (CPU threads slider, seletor GPU/CPU), duracao do video
- `TranscriptionResult.tsx` - resultado final, aceita `isPartial` para cancelamento
- `TranscriptionHistory.tsx` - historico de transcricoes salvo em localStorage (max 50)
- `SettingsPage.tsx` - tela unificada: idioma + dependencias + GPU. Primeira tela na primeira execucao, acessivel depois via FAB

**i18n:**
- `i18n.ts` - strings traduzidas (pt-BR, en, es)
- `LangContext.ts` - React Context com `lang`, `setLang`, `t(key)`
- Idioma salvo em `localStorage`

**Eventos Tauri (listen):**
- `transcribe-step` - muda o passo atual (audio/text)
- `transcribe-progress` - atualiza barra de progresso + texto em tempo real
- `transcribe-lang` - idioma detectado pelo whisper

### Python - `src-tauri/resources/transcribe.py`

- Recebe: arquivo mp3, nome, flags `--model`, `--threads`, `--device`, `--compute_type`
- Usa `faster_whisper.WhisperModel`
- `--device cpu`: usa `compute_type=int8` com `cpu_threads`
- `--device cuda`: usa `compute_type=float16` (GPU NVIDIA), ignora `cpu_threads`
- Output via protocolo stdout (flush=True para streaming)
- Salva resultado em `./output-text/<nome>.txt`

## Configuracao Tauri - `src-tauri/tauri.conf.json`

- Bundle resources: `resources/transcribe.py`
- Icons: `icons/` (32, 128, 128@2x, icns, ico)
- Identifier: `com.srwalkerb.transcribe-app`

## CI/CD - `.github/workflows/release.yml`

- Trigger: push de tags `v*`
- **Precisa de** `permissions: contents: write` (sem isso da "Resource not accessible by integration")
- Matrix: ubuntu-22.04, windows-latest, macos-latest
- Usa `tauri-apps/tauri-action@v0`
- Para criar release: `git tag v0.x.x && git push origin v0.x.x`

## Problemas conhecidos e solucoes

**AppImage + Python:** O AppImage embute seu proprio Python e seta PYTHONHOME/PYTHONPATH apontando pro filesystem read-only interno. Solucao: `python_command()` limpa essas vars, `resolve_command()` usa `canonicalize()` pra pular binarios do mount do AppImage.

**Linux externally-managed-environment:** Distros modernas bloqueiam `pip install` global. Solucao: tenta `--user` primeiro, depois `--break-system-packages`, depois `pipx`. Para pywhispercpp (AMD), cria venv dedicado em `~/.local/share/transcribe-app/venv` como fallback.

**macOS PATH nao herdado:** Apps GUI no macOS nao recebem o PATH do terminal. Solucao: `resolve_command()` busca em `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`.

**macOS code signing:** Builds nao sao assinados/notarizados. O Gatekeeper bloqueia o app na primeira abertura. Usuario precisa ir em System Settings > Privacy & Security para permitir.

## GPU Support

**NVIDIA CUDA:** Suportado via faster-whisper (`transcribe.py`). Deteccao via `nvidia-smi`. CUDA libs (nvidia-cublas-cu12, nvidia-cudnn-cu12) instalaveis pela tela de Settings. Usa `device="cuda"` e `compute_type="float16"`.

**AMD Vulkan:** Suportado via whisper.cpp/pywhispercpp (`transcribe_vk.py`). Deteccao via `lspci` (driver amdgpu). Usa backend Vulkan, nao depende de ROCm/CUDA.

Pre-requisitos do sistema (instalados via `pkexec apt install`):
- `build-essential` (g++, make)
- `cmake`
- `ninja-build` (pywhispercpp usa Ninja como gerador CMake)
- `glslc` (compilador de shaders Vulkan GLSL→SPIR-V, CMake exige via FindVulkan)
- `libvulkan-dev` (headers Vulkan)
- `mesa-vulkan-drivers` (drivers Vulkan)

Instalacao pywhispercpp: `GGML_VULKAN=1 pip install pywhispercpp --no-binary pywhispercpp`
Fallback: cria venv em `~/.local/share/transcribe-app/venv` (para contornar externally-managed-environment).

**IMPORTANTE - Bug do pywhispercpp setup.py:** O setup.py do pywhispercpp passa TODAS as variaveis de ambiente como flags `-D` do CMake (ex: `-DDESKTOP_SESSION=cinnamon`, `-DLS_COLORS=...`). Isso causa erro no CMake quando ha muitas vars. **Solucao implementada:** usar `env_clear()` no Command do Rust e so passar HOME, PATH e GGML_VULKAN=1.

**Arquitetura dual-backend:**
- NVIDIA: `transcribe.py` (faster-whisper + CTranslate2) → device "cuda"
- AMD: `transcribe_vk.py` (pywhispercpp + whisper.cpp) → device "vulkan"
- CPU: `transcribe.py` (faster-whisper) → device "cpu"
- Ambos scripts usam o mesmo protocolo stdout (__DURATION__, __LANG__, __SEG__, __DONE__)
- O modelo "turbo" nao existe no whisper.cpp, mapeado para "large-v3" no script Vulkan

## Status atual - AMD Vulkan (em progresso)

**O que funciona:**
- Deteccao de GPU AMD via lspci (nome limpo extraido dos brackets)
- Deteccao de pre-requisitos: cmake, g++, ninja, glslc, vulkan headers
- Instalacao de pre-requisitos via pkexec (graphical sudo)
- Botoes de "Instalar"/"Atualizar" para todos os deps (sempre acessiveis)
- Instalacao do pywhispercpp SEM Vulkan funciona
- Script transcribe_vk.py funciona (testado com pywhispercpp sem Vulkan - roda em CPU)
- stderr do Python agora eh consumido em thread separada (evita deadlock de buffer)
- Erros do Python sao retornados ao frontend (antes ficava travado)

**O que falta testar/fazer:**
1. Testar instalacao do pywhispercpp COM `GGML_VULKAN=1` usando env_clear() + glslc instalado
   - Comando manual para testar: `env -i HOME=$HOME PATH=/usr/bin:/usr/local/bin:$HOME/.local/bin GGML_VULKAN=1 python3 -m pip install --user --break-system-packages --force-reinstall --no-cache-dir pywhispercpp --no-binary pywhispercpp`
   - Se funcionar, o botao "Install Vulkan" no app deve funcionar tambem
2. Testar transcricao real com GPU AMD via Vulkan
3. Verificar que o app venv python (`~/.local/share/transcribe-app/venv`) eh usado corretamente quando pywhispercpp esta la
4. Testar se o frontend mostra erros corretamente quando a transcricao falha

"""
Run the AI Video Editor backend on Google Colab (GPU) and expose it
publicly through an ngrok tunnel, so a local script/plugin/browser can
call it over HTTPS.

    Local Video Editor  --request-->  ngrok public URL  --request-->  Colab (FastAPI + GPU)
    (Plugin / Script)   <--response--                    <--response--

Usage (inside a Colab notebook cell):

    !git clone https://github.com/SAJIN-SAROSH-S/ai-video-editor.git
    %cd ai-video-editor/backend
    !pip install -r requirements.txt -q
    !pip install pyngrok -q

    import os
    os.environ["NGROK_AUTH_TOKEN"] = "your_ngrok_token_here"   # https://dashboard.ngrok.com/get-started/your-authtoken
    os.environ["PEXELS_API_KEY"] = "your_pexels_key"           # optional
    os.environ["PIXABAY_API_KEY"] = "your_pixabay_key"         # optional
    os.environ["ALLOWED_ORIGINS"] = "*"                        # allow the tunnel's callers

    !bash ollama_setup.sh   # installs Ollama + pulls the model (run once per session)
    !python colab_server.py

The script prints a "Public URL" — set that as VITE_API_BASE (frontend)
or the base URL your local script/plugin points at, e.g.:
    https://xxxx-xx-xxx-xx-xx.ngrok-free.app/api
"""
import os
import subprocess
import sys
import time


def main():
    auth_token = os.getenv("NGROK_AUTH_TOKEN")
    if not auth_token:
        print("ERROR: Set NGROK_AUTH_TOKEN before running (get one free at "
              "https://dashboard.ngrok.com/get-started/your-authtoken).")
        sys.exit(1)

    try:
        from pyngrok import ngrok, conf
    except ImportError:
        print("ERROR: pyngrok not installed. Run: pip install pyngrok")
        sys.exit(1)

    conf.get_default().auth_token = auth_token

    port = int(os.getenv("PORT", "8000"))

    print(f"==> Starting FastAPI backend on port {port}...")
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(port)]
    )

    # Give uvicorn a moment to bind before we open the tunnel.
    time.sleep(4)

    public_url = ngrok.connect(port, "http").public_url
    api_base = f"{public_url}/api"

    print("=" * 60)
    print(f"Public URL:     {public_url}")
    print(f"API base:       {api_base}")
    print(f"Rendered files: {public_url}/videos/<project_id>/final_video.mp4")
    print("=" * 60)
    print("Point your local client (frontend VITE_API_BASE, or your")
    print("Python script/plugin's base URL) at the API base above.")
    print("Leave this cell running — closing it tears down the tunnel and server.")

    try:
        server_proc.wait()
    except KeyboardInterrupt:
        print("==> Shutting down...")
        server_proc.terminate()
        ngrok.disconnect(public_url)


if __name__ == "__main__":
    main()

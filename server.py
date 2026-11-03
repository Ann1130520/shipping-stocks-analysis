import http.server
import socketserver
import webbrowser
import os

PORT = 8088
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def run():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print(f"==================================================")
        print(f" 航運雙雄情報戰情室 本地服務器已啟動！")
        print(f" 網址: {url}")
        print(f" 請勿關閉此視窗，按 Ctrl+C 可停止服務器。")
        print(f"==================================================")
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服務器已停止。")

if __name__ == "__main__":
    run()

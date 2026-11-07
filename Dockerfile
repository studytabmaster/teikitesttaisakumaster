FROM nginx:alpine

RUN echo '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Google ドキュメント</title><link rel="icon" href="https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#fff}iframe{width:100%;height:100%;border:none;display:block}</style></head><body><iframe src="https://teikitesttaisakumaster.lovable.app/" allow="microphone; camera; autoplay; clipboard-write; clipboard-read; encrypted-media; fullscreen"></iframe></body></html>' > /usr/share/nginx/html/index.html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

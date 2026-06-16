FROM redis:7-alpine

CMD ["sh", "-c", "exec redis-server --appendonly yes --dir /data --protected-mode yes --bind 0.0.0.0 --requirepass \"$REDIS_PASSWORD\""]

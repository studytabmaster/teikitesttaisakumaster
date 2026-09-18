-- 定期削除と絞り込みを速くするためのインデックス
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages (created_at);
CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON public.group_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_call_signals_created_at ON public.call_signals (created_at);
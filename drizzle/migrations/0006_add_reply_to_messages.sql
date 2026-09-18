-- 返信（スレッド）機能: 返信先メッセージを紐づける
ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.group_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_messages_reply_to
  ON public.group_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON public.messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
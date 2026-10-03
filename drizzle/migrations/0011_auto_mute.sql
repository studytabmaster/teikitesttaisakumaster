CREATE TABLE IF NOT EXISTS public.user_mutes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  until timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  strikes int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_mutes TO authenticated;
GRANT ALL ON public.user_mutes TO service_role;
ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_mutes_select ON public.user_mutes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator'));

CREATE OR REPLACE FUNCTION public.apply_strike(_uid uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s int; mins int;
BEGIN
  SELECT CASE WHEN updated_at < now() - interval '7 days' THEN 0 ELSE strikes END INTO s
  FROM user_mutes WHERE user_id = _uid;
  s := coalesce(s,0) + 1;
  mins := CASE WHEN s = 1 THEN 10 WHEN s = 2 THEN 60 ELSE 1440 END;
  INSERT INTO user_mutes(user_id, until, reason, strikes, updated_at)
  VALUES (_uid, now() + make_interval(mins => mins), _reason, s, now())
  ON CONFLICT (user_id) DO UPDATE SET until = EXCLUDED.until, reason = EXCLUDED.reason,
    strikes = EXCLUDED.strikes, updated_at = now();
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_strike(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.unmute_user(_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE user_mutes SET until = now(), strikes = 0 WHERE user_id = _uid;
END $$;

CREATE OR REPLACE FUNCTION public.check_message_spam()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  recent_count int;
  duplicate_exists boolean;
  mute_until timestamptz;
  txt text := lower(coalesce(NEW.content,''));
BEGIN
  SELECT until INTO mute_until FROM user_mutes WHERE user_id = NEW.sender_id;
  IF mute_until IS NOT NULL AND mute_until > now() THEN
    RAISE EXCEPTION '不適切な投稿が検出されたため一時ミュート中です（% まで）',
      to_char(mute_until AT TIME ZONE 'Asia/Tokyo', 'MM/DD HH24:MI');
  END IF;

  IF char_length(NEW.content) > 1000 THEN
    RAISE EXCEPTION 'メッセージは1000文字以内で送信してください';
  END IF;

  -- 自動ミュート：暴言・脅迫・個人情報晒し・URL連発（AIを使わず無料で判定）
  IF txt ~ '(死ね|しね|ころす|殺す|殺害|消えろ|きえろ|ガイジ|がいじ|池沼|ちんこ|まんこ|セックスしよ|援交|パパ活)'
     OR txt ~ '0[789]0[- ]?[0-9]{4}[- ]?[0-9]{4}'
     OR (SELECT count(*) FROM regexp_matches(txt, 'https?://', 'g')) >= 3 THEN
    PERFORM apply_strike(NEW.sender_id, left(NEW.content, 100));
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'group_messages' THEN
    SELECT count(*) INTO recent_count FROM public.group_messages
    WHERE sender_id = NEW.sender_id AND created_at > (now() - interval '5 seconds');
  ELSE
    SELECT count(*) INTO recent_count FROM public.messages
    WHERE sender_id = NEW.sender_id AND created_at > (now() - interval '5 seconds');
  END IF;

  IF recent_count >= 8 THEN
    PERFORM apply_strike(NEW.sender_id, '連投スパム');
    RETURN NULL;
  ELSIF recent_count >= 5 THEN
    RAISE EXCEPTION 'メッセージ送信の間隔が早すぎます。少し時間を置いてください';
  END IF;

  IF coalesce(NEW.media_type, 'text') = 'text' AND length(trim(coalesce(NEW.content, ''))) >= 5 THEN
    IF TG_TABLE_NAME = 'group_messages' THEN
      SELECT EXISTS (SELECT 1 FROM public.group_messages WHERE sender_id = NEW.sender_id
        AND group_id = NEW.group_id AND content = NEW.content
        AND created_at > (now() - interval '10 seconds')) INTO duplicate_exists;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public.messages WHERE sender_id = NEW.sender_id
        AND receiver_id = NEW.receiver_id AND content = NEW.content
        AND created_at > (now() - interval '10 seconds')) INTO duplicate_exists;
    END IF;
    IF duplicate_exists THEN
      RAISE EXCEPTION '同じメッセージが短時間に連続して送信されています';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
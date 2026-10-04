CREATE OR REPLACE FUNCTION public.check_message_spam()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  IF txt ~ '(死ね|しね|ころす|殺す|殺害|消えろ|きえろ|ガイジ|がいじ|池沼|ちんこ|まんこ|セックスしよ|援交|パパ活)'
     OR txt ~ '0[789]0[- ]?[0-9]{4}[- ]?[0-9]{4}' THEN
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
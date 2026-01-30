import { useCallback, useEffect, useRef, useState } from 'react';

const YOUTUBE_VIDEO_ID = 'I3ICpSdzUpY';

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: { onReady?: (event: { target: YTPlayer }) => void; onStateChange?: (event: { data: number; target: YTPlayer }) => void };
        }
      ) => YTPlayer;
      PlayerState?: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (n: number) => void;
  mute: () => void;
  unMute: () => void;
  getPlayerState: () => number;
}

interface BGMProps {
  volume: number;
}

const EMBED_PARAMS = `autoplay=1&loop=1&playlist=${YOUTUBE_VIDEO_ID}&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0`;

export function BGM({ volume }: BGMProps) {
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const wantsPlayRef = useRef(false);
  const scriptLoadedRef = useRef(false);

  const hasAPI = useCallback(() => typeof window !== 'undefined' && !!window.YT?.Player, []);

  const loadYouTubeAPI = useCallback(() => {
    if (typeof window === 'undefined' || scriptLoadedRef.current || isLocalhost()) return;
    if (hasAPI()) return;
    scriptLoadedRef.current = true;
    const script = document.createElement('script');
    script.src = 'https://www.youtube-nocookie.com/iframe_api';
    script.async = true;
    document.body.appendChild(script);
  }, [hasAPI]);

  const createAndPlay = useCallback(() => {
    if (!hasAPI()) return;
    if (!document.getElementById('bgm-yt-iframe') || playerRef.current) return;
    try {
      new window.YT!.Player('bgm-yt-iframe', {
        videoId: YOUTUBE_VIDEO_ID,
        playerVars: {
          origin: window.location.origin,
          autoplay: 1,
          loop: 1,
          playlist: YOUTUBE_VIDEO_ID,
          modestbranding: 1,
          rel: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady(ev) {
            const p = ev.target as unknown as YTPlayer;
            playerRef.current = p;
            const v = Math.max(0, Math.min(1, volume));
            p.setVolume(Math.round(v * 100));
            if (v <= 0) p.mute();
            else p.unMute();
            if (wantsPlayRef.current) {
              p.playVideo();
              setPlaying(true);
              wantsPlayRef.current = false;
            }
          },
          onStateChange(ev: { data: number; target: YTPlayer }) {
            const ENDED = window.YT?.PlayerState?.ENDED ?? 0;
            if (ev.data === ENDED) setTimeout(() => { try { ev.target.playVideo(); } catch {} }, 100);
          },
        },
      });
    } catch {
      wantsPlayRef.current = false;
    }
  }, [hasAPI, volume]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const v = Math.max(0, Math.min(1, volume));
    try {
      p.setVolume(Math.round(v * 100));
      if (v <= 0) p.mute();
      else p.unMute();
    } catch {
      /* ignore */
    }
  }, [volume]);

  const toggle = useCallback(() => {
    if (isLocalhost()) {
      setPlaying((prev) => !prev);
      return;
    }
    const p = playerRef.current;
    if (!p) {
      wantsPlayRef.current = true;
      loadYouTubeAPI();
      const tryCreate = () => {
        if (!hasAPI()) return;
        createAndPlay();
        const poll = setInterval(() => {
          const px = playerRef.current;
          if (px && wantsPlayRef.current) {
            px.playVideo();
            setPlaying(true);
            wantsPlayRef.current = false;
            clearInterval(poll);
          }
        }, 150);
        setTimeout(() => clearInterval(poll), 4000);
      };
      tryCreate();
      if (!hasAPI()) {
        const w = setInterval(() => {
          if (hasAPI()) { clearInterval(w); tryCreate(); }
        }, 100);
        setTimeout(() => clearInterval(w), 10000);
      }
      return;
    }
    const state = p.getPlayerState?.();
    const playingState = window.YT?.PlayerState?.PLAYING ?? 1;
    if (state === playingState) {
      p.pauseVideo();
      setPlaying(false);
    } else {
      p.playVideo();
      setPlaying(true);
    }
  }, [createAndPlay, hasAPI, loadYouTubeAPI]);

  useEffect(() => {
    if (typeof window === 'undefined' || isLocalhost()) return;
    loadYouTubeAPI();
  }, [loadYouTubeAPI]);

  useEffect(() => {
    if (typeof window === 'undefined' || isLocalhost()) return;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (wantsPlayRef.current && !playerRef.current) createAndPlay();
    };
    return () => { window.onYouTubeIframeAPIReady = prev; };
  }, [createAndPlay]);

  if (isLocalhost()) {
    return (
      <>
        {playing && (
          <div className="bgm-yt-container bgm-yt-container--active" aria-hidden>
            <iframe
              title="BGM"
              src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_VIDEO_ID}?${EMBED_PARAMS}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
              allowFullScreen
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0 }}
            />
          </div>
        )}
        <button
          type="button"
          className="bgm-toggle"
          onClick={toggle}
          title={playing ? 'BGM 끄기' : 'BGM 켜기'}
          aria-label={playing ? 'BGM 끄기' : 'BGM 켜기'}
        >
          {playing ? '🔊 BGM' : '🔇 BGM'}
        </button>
      </>
    );
  }

  return (
    <>
      <div id="bgm-yt-iframe" className="bgm-yt-container bgm-yt-container--active" aria-hidden />
      <button
        type="button"
        className="bgm-toggle"
        onClick={toggle}
        title={playing ? 'BGM 끄기' : 'BGM 켜기'}
        aria-label={playing ? 'BGM 끄기' : 'BGM 켜기'}
      >
        {playing ? '🔊 BGM' : '🔇 BGM'}
      </button>
    </>
  );
}

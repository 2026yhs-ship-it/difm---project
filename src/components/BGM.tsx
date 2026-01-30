import { useCallback, useEffect, useRef, useState } from 'react';

const YOUTUBE_VIDEO_ID = 'I3ICpSdzUpY';

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

export function BGM({ volume }: BGMProps) {
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const wantsPlayRef = useRef(false);
  const scriptLoadedRef = useRef(false);
  const creatingRef = useRef(false);

  const hasAPI = useCallback(() => typeof window !== 'undefined' && !!window.YT?.Player, []);

  const loadYouTubeAPI = useCallback(() => {
    if (typeof window === 'undefined' || scriptLoadedRef.current) return;
    if (hasAPI()) return;
    scriptLoadedRef.current = true;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.body.appendChild(script);
  }, [hasAPI]);

  const createAndPlay = useCallback(() => {
    if (!hasAPI()) return;
    const el = document.getElementById('bgm-yt-iframe');
    if (!el || playerRef.current || creatingRef.current) return;
    creatingRef.current = true;
    const failSafe = setTimeout(() => {
      if (!playerRef.current) creatingRef.current = false;
    }, 8000);
    try {
      new window.YT!.Player('bgm-yt-iframe', {
        videoId: YOUTUBE_VIDEO_ID,
        playerVars: {
          autoplay: 1,
          loop: 1,
          playlist: YOUTUBE_VIDEO_ID,
          modestbranding: 1,
          rel: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          enablejsapi: 1,
        },
        events: {
          onReady(ev) {
            clearTimeout(failSafe);
            creatingRef.current = false;
            const p = ev.target as unknown as YTPlayer;
            playerRef.current = p;
            const v = Math.max(0, Math.min(1, volume));
            p.setVolume(Math.round(v * 100));
            if (v <= 0) p.mute();
            else p.unMute();
            if (wantsPlayRef.current) {
              wantsPlayRef.current = false;
              setTimeout(() => {
                try {
                  p.playVideo();
                  setPlaying(true);
                } catch {
                  setPlaying(false);
                }
              }, 150);
            }
          },
          onStateChange(ev: { data: number; target: YTPlayer }) {
            const ENDED = window.YT?.PlayerState?.ENDED ?? 0;
            if (ev.data === ENDED) setTimeout(() => { try { ev.target.playVideo(); } catch {} }, 100);
          },
        },
      });
    } catch {
      clearTimeout(failSafe);
      creatingRef.current = false;
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
            try {
              px.playVideo();
              setPlaying(true);
            } finally {
              wantsPlayRef.current = false;
            }
            clearInterval(poll);
          }
        }, 200);
        setTimeout(() => clearInterval(poll), 5000);
      };
      if (hasAPI()) {
        tryCreate();
      } else {
        const w = setInterval(() => {
          if (hasAPI()) {
            clearInterval(w);
            tryCreate();
          }
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
      try {
        p.playVideo();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  }, [createAndPlay, hasAPI, loadYouTubeAPI]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    loadYouTubeAPI();
  }, [loadYouTubeAPI]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (wantsPlayRef.current && !playerRef.current) createAndPlay();
    };
    return () => { window.onYouTubeIframeAPIReady = prev; };
  }, [createAndPlay]);

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

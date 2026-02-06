import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_LIVES = 3;

const DIFFICULTY_PRESETS = {
  Easy: { lifetimeMs: 1200, spawnEveryMs: 720 },
  Medium: { lifetimeMs: 1000, spawnEveryMs: 660 },
  Hard: { lifetimeMs: 900, spawnEveryMs: 600 },
  Extreme: { lifetimeMs: 750, spawnEveryMs: 500 },
  Agony: { lifetimeMs: 600, spawnEveryMs: 400 },
};

const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 30;
const DEFAULT_DURATION_SEC = 10;

const MIN_SIZE = 56;
const MAX_SIZE = 110;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function findSpotAnywhere(width, height, size) {
  const pad = 10;
  const x = rand(pad, Math.max(pad, width - pad - size));
  const y = rand(pad, Math.max(pad, height - pad - size));
  return { x, y };
}

function Circle({ circle, playing, onHit, onExpire }) {
  const hitRef = useRef(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!playing) return;

    timeoutRef.current = setTimeout(() => {
      onExpire(circle.id, hitRef.current);
    }, circle.lifetimeMs);

    return () => clearTimeout(timeoutRef.current);
  }, [circle.id, circle.lifetimeMs, onExpire, playing]);

  const handlePress = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (hitRef.current) return;
    hitRef.current = true;

    onHit(circle.id);
  };

  return (
    <button
      className="circle"
      style={{
        width: circle.size,
        height: circle.size,
        left: circle.x,
        top: circle.y,
      }}
      onPointerDown={handlePress}
      aria-label="circle"
    >
      <svg className="ring" viewBox="0 0 100 100" style={{ "--dur": `${circle.lifetimeMs}ms` }}>
        <circle className="ringTrack" cx="50" cy="50" r="44" />
        <circle className="ringTimer" cx="50" cy="50" r="44" />
      </svg>
      <span className="core" />
    </button>
  );
}

function Lives({ lives, maxLives, infinite }) {
  if (infinite) {
    return (
      <div className="lives livesText">
        <span className="livesLabel">Lives</span>
        <span className="livesBadge">INF</span>
      </div>
    );
  }

  if (maxLives > 7) {
    return (
      <div className="lives livesText">
        <span className="livesLabel">Lives</span>
        <span className="livesCount">
          {lives}/{maxLives}
        </span>
      </div>
    );
  }

  return (
    <div className="lives">
      {Array.from({ length: maxLives }).map((_, i) => {
        const alive = i < lives;
        return <div key={i} className={"pip " + (alive ? "pipAlive" : "pipDead")} />;
      })}
    </div>
  );
}

function FailureOverlay({ score, onRestart }) {
  return (
    <div className="overlay">
      <div className="overlayPanel">
        <div className="overlayTitle">Failure</div>
        <div className="overlayText">Score: {score}</div>
        <button className="btn btnStart" onClick={onRestart}>
          Restart
        </button>
      </div>
    </div>
  );
}

function CompleteOverlay({ score, onRestart }) {
  return (
    <div className="overlay">
      <div className="overlayPanel">
        <div className="overlayTitle">Time Up</div>
        <div className="overlayText">Score: {score}</div>
        <button className="btn btnStart" onClick={onRestart}>
          Restart
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [circles, setCircles] = useState([]);
  const [lives, setLives] = useState(DEFAULT_LIVES);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);

  const [missFlash, setMissFlash] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [difficulty, setDifficulty] = useState("Medium");
  const [maxLivesInput, setMaxLivesInput] = useState(String(DEFAULT_LIVES));
  const [infiniteLives, setInfiniteLives] = useState(false);
  const [durationSec, setDurationSec] = useState(DEFAULT_DURATION_SEC);
  const [infiniteDuration, setInfiniteDuration] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(DEFAULT_DURATION_SEC * 1000);

  const arenaRef = useRef(null);
  const settingsRef = useRef(null);
  const settingsBtnRef = useRef(null);
  const spawnRef = useRef(null);
  const roundTimerRef = useRef(null);
  const roundEndRef = useRef(null);

  const parsedLives = Number.parseInt(maxLivesInput, 10);
  const maxLives = Number.isFinite(parsedLives) && parsedLives >= 1 ? parsedLives : 1;

  const isInfiniteLives = infiniteLives;
  const isInfiniteDuration = infiniteDuration;
  const failed = !isInfiniteLives && lives <= 0;

  const difficultyConfig = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.Medium;
  const timeLeftSec = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const timeLabel = isInfiniteDuration ? "INF" : `${playing ? timeLeftSec : durationSec}s`;

  const status = useMemo(() => {
    if (failed) return "FAILED";
    if (completed) return "COMPLETE";
    if (!playing) return "READY";
    return "PLAYING";
  }, [completed, failed, playing]);

  const doMissFX = useCallback(() => {
    setMissFlash(true);
    window.setTimeout(() => setMissFlash(false), 140);
  }, [setMissFlash]);

  const loseLife = useCallback(() => {
    if (isInfiniteLives) {
      doMissFX();
      return;
    }

    setLives((v) => {
      if (v <= 0) return 0;
      doMissFX();
      return v - 1;
    });
  }, [doMissFX, isInfiniteLives, setLives]);

  const onHit = useCallback(
    (id) => {
      setScore((s) => s + 1);

      setTimeout(() => {
        setCircles((prev) => prev.filter((c) => c.id !== id));
      }, 60);
    },
    [setScore, setCircles]
  );

  const onExpire = useCallback(
    (id, wasHit) => {
      setCircles((prev) => prev.filter((c) => c.id !== id));

      if (!wasHit) loseLife();
    },
    [loseLife, setCircles]
  );

  const onArenaPointerDown = (e) => {
    if (!playing) return;
    if (failed) return;

    loseLife();
  };

  const adjustLives = useCallback(
    (delta) => {
      if (isInfiniteLives) return;
      const current = Number.isFinite(parsedLives) && parsedLives >= 1 ? parsedLives : 1;
      const next = Math.max(1, current + delta);
      setMaxLivesInput(String(next));
    },
    [isInfiniteLives, parsedLives]
  );

  const start = () => {
    setLives(isInfiniteLives ? 1 : maxLives);
    setScore(0);
    setCircles([]);
    setCompleted(false);
    setSettingsOpen(false);
    setTimeLeftMs(isInfiniteDuration ? Number.POSITIVE_INFINITY : durationSec * 1000);
    setPlaying(true);
  };

  const reset = () => {
    setPlaying(false);
    setCircles([]);
    setLives(isInfiniteLives ? 1 : maxLives);
    setScore(0);
    setCompleted(false);
    setTimeLeftMs(isInfiniteDuration ? Number.POSITIVE_INFINITY : durationSec * 1000);
  };

  const restart = () => {
    setLives(isInfiniteLives ? 1 : maxLives);
    setScore(0);
    setCircles([]);
    setCompleted(false);
    setSettingsOpen(false);
    setTimeLeftMs(isInfiniteDuration ? Number.POSITIVE_INFINITY : durationSec * 1000);
    setPlaying(true);
  };

  useEffect(() => {
    if (failed) setPlaying(false);
  }, [failed]);

  useEffect(() => {
    if (failed) setCompleted(false);
  }, [failed]);

  useEffect(() => {
    if (!settingsOpen) return;

    const handlePointerDown = (event) => {
      const panel = settingsRef.current;
      const button = settingsBtnRef.current;
      if (!panel) return;

      if (panel.contains(event.target)) return;
      if (button && button.contains(event.target)) return;

      setSettingsOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [settingsOpen]);

  useEffect(() => {
    if (playing) return;
    if (failed || completed) return;

    if (isInfiniteLives) {
      setLives(1);
      return;
    }

    setLives(maxLives);
  }, [isInfiniteLives, maxLives, playing]);

  useEffect(() => {
    if (playing) return;
    if (isInfiniteDuration) {
      setTimeLeftMs(Number.POSITIVE_INFINITY);
      return;
    }
    setTimeLeftMs(durationSec * 1000);
  }, [durationSec, isInfiniteDuration, playing]);

  useEffect(() => {
    if (!playing) return;

    if (isInfiniteDuration) {
      setTimeLeftMs(Number.POSITIVE_INFINITY);
      return () => {
        window.clearInterval(roundTimerRef.current);
        window.clearTimeout(roundEndRef.current);
      };
    }

    const endAt = Date.now() + durationSec * 1000;
    setTimeLeftMs(durationSec * 1000);

    const tick = () => {
      const remaining = endAt - Date.now();
      if (remaining <= 0) {
        setTimeLeftMs(0);
        setPlaying(false);
        setCompleted(true);
        return;
      }
      setTimeLeftMs(remaining);
    };

    tick();
    roundTimerRef.current = window.setInterval(tick, 100);
    roundEndRef.current = window.setTimeout(() => {
      setTimeLeftMs(0);
      setPlaying(false);
      setCompleted(true);
    }, durationSec * 1000);

    return () => {
      window.clearInterval(roundTimerRef.current);
      window.clearTimeout(roundEndRef.current);
    };
  }, [durationSec, isInfiniteDuration, playing]);

  useEffect(() => {
    if (!playing) return;
    if (failed) return;

    const arena = arenaRef.current;
    if (!arena) return;

    const spawnOne = () => {
      const rect = arena.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      const size = Math.round(rand(MIN_SIZE, MAX_SIZE));
      const spot = findSpotAnywhere(w, h, size);

      setCircles((prev) => [
        ...prev,
        {
          id: uid(),
          x: spot.x,
          y: spot.y,
          size,
          lifetimeMs: difficultyConfig.lifetimeMs,
        },
      ]);
    };

    spawnOne();
    setTimeout(spawnOne, Math.round(difficultyConfig.spawnEveryMs * 0.45));

    spawnRef.current = setInterval(spawnOne, difficultyConfig.spawnEveryMs);

    return () => clearInterval(spawnRef.current);
  }, [playing, failed, difficultyConfig.lifetimeMs, difficultyConfig.spawnEveryMs]);

  useEffect(() => {
    if (!playing) setCircles([]);
  }, [playing]);

  return (
    <div className="page">
      <div className="appShell">
        <div className="topBar">
          <div className="title">Quick Time Events</div>

          <div className="topRight">
            <Lives lives={lives} maxLives={maxLives} infinite={isInfiniteLives} />
            <button
              ref={settingsBtnRef}
              className={"btn btnDifficulty " + (settingsOpen ? "btnActive" : "")}
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              Difficulty
            </button>
          </div>
        </div>

        <div ref={settingsRef} className={"settingsPanel " + (settingsOpen ? "open" : "")}>
          <div className="settingsGrid">
            <div className="settingBlock">
              <div className="settingLabel">Difficulty</div>
              <div className="segmented" role="radiogroup" aria-label="Difficulty">
                {Object.keys(DIFFICULTY_PRESETS).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={"segBtn " + (difficulty === key ? "segBtnActive" : "")}
                    aria-pressed={difficulty === key}
                    onClick={() => setDifficulty(key)}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className="settingHelp">Faster spawn rates and lower cooldowns at higher levels.</div>
            </div>

            <div className="settingBlock">
              <div className="settingLabel">Lives</div>
              <div className="livesControls">
                <div className={"stepper " + (isInfiniteLives ? "stepperDisabled" : "")}>
                  <button
                    className="stepBtn"
                    type="button"
                    onClick={() => adjustLives(-1)}
                    disabled={isInfiniteLives}
                    aria-label="Decrease lives"
                  >
                    -
                  </button>
                  <input
                    className="numberInput"
                    type="number"
                    min="1"
                    step="1"
                    value={maxLivesInput}
                    onChange={(e) => setMaxLivesInput(e.target.value)}
                    onBlur={(e) => {
                      const value = Number.parseInt(e.target.value, 10);
                      const next = Number.isFinite(value) && value >= 1 ? value : 1;
                      setMaxLivesInput(String(next));
                    }}
                    disabled={isInfiniteLives}
                  />
                  <button
                    className="stepBtn"
                    type="button"
                    onClick={() => adjustLives(1)}
                    disabled={isInfiniteLives}
                    aria-label="Increase lives"
                  >
                    +
                  </button>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={isInfiniteLives}
                    onChange={(e) => setInfiniteLives(e.target.checked)}
                  />
                  Infinite
                </label>
              </div>
              <div className="settingHelp">Set a fixed number of lives, or infinite.</div>
            </div>

            <div className="settingBlock">
              <div className="settingLabel">Round Duration</div>
              <div className="rangeRow">
                <input
                  className="rangeInput"
                  type="range"
                  min={MIN_DURATION_SEC}
                  max={MAX_DURATION_SEC}
                  step="1"
                  value={durationSec}
                  onChange={(e) => setDurationSec(clamp(Number(e.target.value), MIN_DURATION_SEC, MAX_DURATION_SEC))}
                  disabled={isInfiniteDuration}
                />
                <div className="rangeValue">{isInfiniteDuration ? "INF" : `${durationSec}s`}</div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={isInfiniteDuration}
                  onChange={(e) => setInfiniteDuration(e.target.checked)}
                />
                Infinite
              </label>
              <div className="settingHelp">Default 10s. Range 5-30s or infinite.</div>
            </div>
          </div>
        </div>

        <div
          ref={arenaRef}
          className={"arena " + (missFlash ? "arenaMiss" : "")}
          onPointerDown={onArenaPointerDown}
        >
          {circles.map((c) => (
            <Circle key={c.id} circle={c} playing={playing} onHit={onHit} onExpire={onExpire} />
          ))}

          {!playing && !failed && !completed && (
            <div className="hint">
              Tap the QTE circles before the ring ends.
              <br />
              Clicking anywhere else costs a life.
            </div>
          )}

          {failed && <FailureOverlay score={score} onRestart={restart} />}
          {!failed && completed && <CompleteOverlay score={score} onRestart={restart} />}
        </div>

        <div className="bottomBar">
          <div className="score">
            Status: <span className="scoreValue">{status}</span> | Score:{" "}
            <span className="scoreValue">{score}</span> | Time:{" "}
            <span className="scoreValue">{timeLabel}</span>
          </div>

          <div className="bottomButtons">
            <button className="btn btnStart" onClick={start} disabled={playing && !failed}>
              Start
            </button>
            <button className="btn btnReset" onClick={reset}>
              Reset
            </button>
          </div>

          <div className="byline">By StarPlatinumSan</div>
        </div>
      </div>
    </div>
  );
}

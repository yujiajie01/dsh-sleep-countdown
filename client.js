/**
 * Sleep countdown — counts down to bedtime (23:30 on workdays) and plays a
 * gentle chime when time is up. Renders below the composer.
 */
window.__ModuleLoader__.load({
  id: '@local/sleep-countdown',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'sleep-countdown';
    const TARGET_HOUR = 23;
    const TARGET_MINUTE = 30;
    const WORKDAYS = [1, 2, 3, 4, 5]; // Monday .. Friday
    const SNOOZE_MS = 10 * 60 * 1000;
    const STORAGE_KEY = 'dsh.sleep-countdown.muted';

    const ZH = {
      label: '距离睡觉',
      due: '该睡觉了，晚安',
      snooze: '再等 10 分钟',
      ok: '知道了',
      mute: '关闭提示音',
      unmute: '开启提示音',
      locked: '声音待启用',
      unitDays: '天',
      title: '工作日 23:30 睡觉提醒',
      next: '下次提醒',
    };
    const EN = {
      label: 'Until bed',
      due: 'Bedtime — good night',
      snooze: 'Snooze 10 min',
      ok: 'Got it',
      mute: 'Mute chime',
      unmute: 'Enable chime',
      locked: 'Sound off',
      unitDays: 'd',
      title: 'Weekday 23:30 bedtime reminder',
      next: 'Next reminder',
    };

    const CSS = [
      '.dsc-root{display:inline-flex;align-items:center;gap:6px;padding:2px 6px 2px 8px;border-radius:999px;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;',
      'font-variant-numeric:tabular-nums;user-select:none;max-width:100%}',
      '.dsc-moon{display:inline-flex;color:var(--dsw-alias-brand-primary);flex:none}',
      '.dsc-label{white-space:nowrap}',
      '.dsc-time{color:var(--dsw-alias-label-primary);font-weight:600;letter-spacing:.01em;white-space:nowrap}',
      '.dsc-soon{color:var(--dsw-alias-state-warn-primary)}',
      '.dsc-urgent{color:var(--dsw-alias-state-error-primary)}',
      '.dsc-due{color:var(--dsw-alias-state-warn-primary);font-weight:600;white-space:nowrap}',
      '.dsc-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:transparent;',
      'color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:16px;padding:1px 8px;',
      'border-radius:999px;cursor:pointer;white-space:nowrap}',
      '.dsc-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsc-icon-btn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);',
      'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;',
      'border-radius:999px;cursor:pointer;flex:none}',
      '.dsc-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsc-btn:focus-visible,.dsc-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsc-hint{color:var(--dsw-alias-label-caption);font-size:11px;white-space:nowrap}',
    ].join('');

    function pad(value) {
      return value < 10 ? '0' + value : String(value);
    }

    /** Next weekday 23:30 strictly after `nowMs`, in the browser's local zone. */
    function nextTargetAt(nowMs) {
      const probe = new Date(nowMs);
      probe.setHours(TARGET_HOUR, TARGET_MINUTE, 0, 0);
      for (let step = 0; step < 8; step += 1) {
        if (WORKDAYS.indexOf(probe.getDay()) >= 0 && probe.getTime() > nowMs) {
          return probe.getTime();
        }
        probe.setDate(probe.getDate() + 1);
        probe.setHours(TARGET_HOUR, TARGET_MINUTE, 0, 0);
      }
      return probe.getTime();
    }

    function formatRemaining(t, ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const days = Math.floor(total / 86400);
      const clock = pad(Math.floor((total % 86400) / 3600)) + ':' +
        pad(Math.floor((total % 3600) / 60)) + ':' + pad(total % 60);
      return days > 0 ? days + t('unitDays') + ' ' + clock : clock;
    }

    function readMuted() {
      try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
      } catch (error) {
        return false;
      }
    }

    function writeMuted(muted) {
      try {
        window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
      } catch (error) {
        /* storage may be unavailable; the in-memory state still works */
      }
    }

    function tone(ac, freq, at, duration, peak) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(at);
      osc.stop(at + duration + 0.05);
    }

    /** Lazily created Web Audio chime; disposes its context with the component. */
    function createSound(onStateChange) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      let ac = null;

      function ensure() {
        if (ac) return ac;
        if (!AudioCtor) return null;
        try {
          ac = new AudioCtor();
          ac.onstatechange = function () {
            if (onStateChange) onStateChange();
          };
        } catch (error) {
          ac = null;
        }
        return ac;
      }

      function unlock() {
        const ctx = ensure();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
          ctx.resume().then(function () {
            if (onStateChange) onStateChange();
          }).catch(function () {});
        }
      }

      function chime() {
        const ctx = ensure();
        if (!ctx) return;
        unlock();
        const start = ctx.currentTime + 0.06;
        const notes = [523.25, 659.25, 783.99, 1046.5];
        for (let round = 0; round < 3; round += 1) {
          for (let index = 0; index < notes.length; index += 1) {
            tone(ctx, notes[index], start + round * 2.4 + index * 0.17, 1, 0.14);
          }
        }
      }

      function tick() {
        const ctx = ensure();
        if (!ctx) return;
        unlock();
        tone(ctx, 880, ctx.currentTime + 0.02, 0.14, 0.09);
      }

      function ready() {
        return !!ac && ac.state === 'running';
      }

      function dispose() {
        if (!ac) return;
        const current = ac;
        ac = null;
        current.onstatechange = null;
        try {
          current.close();
        } catch (error) {
          /* already closed */
        }
      }

      return { ensure, unlock, chime, tick, ready, dispose };
    }

    function MoonIcon() {
      return h('svg', {
        className: 'dsc-moon', viewBox: '0 0 24 24', width: 14, height: 14,
        'aria-hidden': true, focusable: false,
      }, h('path', {
        d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
        fill: 'currentColor',
      }));
    }

    function BellIcon(props) {
      return h('svg', {
        viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'aria-hidden': true, focusable: false,
      },
        h('path', { d: 'M6 8a6 6 0 1 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 12.5 6 8Z' }),
        h('path', { d: 'M10 18a2 2 0 0 0 4 0' }),
        props && props.off ? h('path', { d: 'M4 4l16 16' }) : null);
    }

    function createComponent(ctx) {
      const translate = ctx.locale.bind(NS);

      function useTranslate() {
        const force = React.useReducer(function (count) { return count + 1; }, 0)[1];
        React.useEffect(function () {
          return ctx.locale.subscribe(function () { force(); });
        }, []);
        return translate;
      }

      function SleepCountdown() {
        const t = useTranslate();
        const [now, setNow] = React.useState(function () { return Date.now(); });
        const [deadline, setDeadline] = React.useState(function () { return nextTargetAt(Date.now()); });
        const [muted, setMuted] = React.useState(readMuted);
        const [locked, setLocked] = React.useState(false);
        const soundRef = React.useRef(null);
        const firedRef = React.useRef(null);

        React.useEffect(function () {
          const timer = setInterval(function () { setNow(Date.now()); }, 1000);
          const onVisible = function () { setNow(Date.now()); };
          document.addEventListener('visibilitychange', onVisible);
          return function () {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
          };
        }, []);

        React.useEffect(function () {
          const sound = createSound(function () {
            setLocked(!sound.ready());
          });
          soundRef.current = sound;
          sound.ensure();
          setLocked(!sound.ready());
          const unlock = function () { sound.unlock(); };
          window.addEventListener('pointerdown', unlock, true);
          window.addEventListener('keydown', unlock, true);
          return function () {
            window.removeEventListener('pointerdown', unlock, true);
            window.removeEventListener('keydown', unlock, true);
            sound.dispose();
            soundRef.current = null;
          };
        }, []);

        React.useEffect(function () {
          if (now < deadline || firedRef.current === deadline) return;
          firedRef.current = deadline;
          if (!muted && soundRef.current) soundRef.current.chime();
        }, [now, deadline, muted]);

        function toggleMute() {
          const next = !muted;
          setMuted(next);
          writeMuted(next);
          if (!next && soundRef.current) soundRef.current.tick();
        }

        function snooze() {
          firedRef.current = null;
          setDeadline(Date.now() + SNOOZE_MS);
          setNow(Date.now());
        }

        function dismiss() {
          firedRef.current = null;
          setDeadline(nextTargetAt(Date.now()));
          setNow(Date.now());
        }

        const due = now >= deadline;
        const remaining = deadline - now;
        const timeClass = remaining < 10 * 60 * 1000
          ? 'dsc-time dsc-urgent'
          : remaining < 60 * 60 * 1000
            ? 'dsc-time dsc-soon'
            : 'dsc-time';
        const target = new Date(deadline).toLocaleString();

        return h(React.Fragment, null,
          h('style', { key: 'styles' }, CSS),
          h('div', {
            key: 'root',
            className: 'dsc-root',
            title: due ? t('due') : t('title') + ' · ' + t('next') + ' ' + target,
          },
            h(MoonIcon),
            due
              ? h('span', { className: 'dsc-due', role: 'status' }, t('due'))
              : h('span', { className: 'dsc-label' }, t('label')),
            due ? null : h('span', { className: timeClass }, formatRemaining(t, remaining)),
            due ? h('button', {
              className: 'dsc-btn', type: 'button', onClick: snooze,
            }, t('snooze')) : null,
            due ? h('button', {
              className: 'dsc-btn', type: 'button', onClick: dismiss,
            }, t('ok')) : null,
            h('button', {
              className: 'dsc-icon-btn',
              type: 'button',
              onClick: toggleMute,
              title: muted ? t('unmute') : t('mute'),
              'aria-label': muted ? t('unmute') : t('mute'),
              'aria-pressed': !muted,
            }, h(BellIcon, { off: muted })),
            locked && !muted && !due
              ? h('span', { className: 'dsc-hint' }, t('locked'))
              : null));
      }

      return SleepCountdown;
    }

    function registerLocales(ctx) {
      const entries = [
        ['zh', ZH], ['zh-CN', ZH], ['en', EN], ['en-US', EN],
      ];
      const disposers = [];
      for (let index = 0; index < entries.length; index += 1) {
        try {
          disposers.push(ctx.locale.register(NS, entries[index][0], entries[index][1]));
        } catch (error) {
          /* another mount already registered this dictionary */
        }
      }
      return disposers;
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const disposers = registerLocales(ctx);
        ctx.effect(function () {
          return function () {
            for (let index = 0; index < disposers.length; index += 1) disposers[index]();
          };
        });

        const SleepCountdown = createComponent(ctx);
        const mount = function () {
          return ctx.slots.inject('conversation.composer.dock', function () {
            return ctx.slots.register({
              name: 'conversation.composer.dock',
              id: 'sleep-countdown',
              order: 5,
              label: function () { return ctx.locale.bind(NS)('label'); },
            }, SleepCountdown);
          });
        };
        ctx.effect(mount);
      },
    };
  },
});

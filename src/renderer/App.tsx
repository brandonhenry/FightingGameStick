import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Copy,
  Download,
  Gamepad2,
  Keyboard,
  MousePointer2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Route,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  allTargets,
  bindingTargetLabel,
  bindingTargetShortLabel,
  isTargetActive,
  targetLabels,
  targetShortLabels,
} from '../shared/controller';
import {
  controllerChordButtons,
  controllerChordLabel,
  createControllerChordTarget,
  isControllerChordTarget,
  type ControllerChordButton,
} from '../shared/controller-chords';
import {
  createMotionShortcutTarget,
  isMotionShortcutTarget,
  motionAttacks,
  parseMotionShortcut,
  type MotionAttack,
  type QuarterCircleMotion,
} from '../shared/motion-shortcuts';
import appIconUrl from '../../assets/icons/app.png';
import { getFightStickLeverPose } from './fight-stick-pose';
import type {
  AppSnapshot,
  BindingTarget,
  ControllerChordTarget,
  ControllerState,
  ControllerTarget,
  DiagnosticResult,
  MappingProfile,
  MotionShortcutTarget,
} from '../shared/types';

type ProfileDialog = { mode: 'new' | 'rename'; initial: string } | null;

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [profileDialog, setProfileDialog] = useState<ProfileDialog>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingSnapshot = useRef<AppSnapshot | null>(null);
  const animationFrame = useRef<number | null>(null);
  const lastNoticeId = useRef<number | null>(null);

  useEffect(() => {
    void window.fightingGameStick.getSnapshot().then(setSnapshot);
    const unsubscribe = window.fightingGameStick.onSnapshot((next) => {
      pendingSnapshot.current = next;
      if (animationFrame.current !== null) return;
      animationFrame.current = requestAnimationFrame(() => {
        if (pendingSnapshot.current) setSnapshot(pendingSnapshot.current);
        pendingSnapshot.current = null;
        animationFrame.current = null;
      });
    });
    return () => {
      unsubscribe();
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2_600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!snapshot?.notice || snapshot.notice.id === lastNoticeId.current) return;
    lastNoticeId.current = snapshot.notice.id;
    setToast(snapshot.notice.message);
  }, [snapshot?.notice]);

  useEffect(() => {
    if (!deleteArmed) return;
    const timeout = window.setTimeout(() => setDeleteArmed(false), 3_000);
    return () => window.clearTimeout(timeout);
  }, [deleteArmed]);

  const run = useCallback(async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await action();
      if (success) setToast(success);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, []);

  if (!snapshot) return <LoadingScreen />;

  const activeProfile =
    snapshot.profiles.find((profile) => profile.id === snapshot.activeProfileId) ?? snapshot.profiles[0]!;
  const runtime = snapshot.runtime;
  const statusLabel =
    runtime.helperState === 'demo'
      ? 'Demo mode'
      : runtime.helperState === 'ready'
        ? `Player ${(runtime.playerIndex ?? 0) + 1}`
        : runtime.helperState === 'fault'
          ? 'Needs attention'
          : 'Connecting';

  const bind = (target: BindingTarget) => {
    void run(() => window.fightingGameStick.beginCapture(target));
  };

  const submitProfileDialog = (name: string) => {
    if (profileDialog?.mode === 'new') {
      void run(() => window.fightingGameStick.createProfile(name), 'Profile created.');
    } else if (profileDialog?.mode === 'rename') {
      void run(() => window.fightingGameStick.renameProfile(activeProfile.id, name), 'Profile renamed.');
    }
    setProfileDialog(null);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Fighting Game Stick">
          <div className="brand-mark" aria-hidden="true">
            <img src={appIconUrl} alt="" />
          </div>
          <div>
            <strong>Fighting Game Stick</strong>
            <span>Keyboard + mouse → XInput</span>
          </div>
        </div>

        <div className={`connection-pill connection-${runtime.helperState}`}>
          <span className="status-dot" />
          <span>{statusLabel}</span>
          {runtime.latencyMs !== null && <span className="latency">{runtime.latencyMs} ms</span>}
        </div>

        <div className="topbar-spacer" />

        <label className="profile-select-wrap">
          <span>Profile</span>
          <select
            value={activeProfile.id}
            onChange={(event) => void run(() => window.fightingGameStick.selectProfile(event.target.value))}
            disabled={busy}
          >
            {snapshot.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>

        <div className="profile-actions" aria-label="Profile actions">
          <IconButton label="New profile" onClick={() => setProfileDialog({ mode: 'new', initial: 'New profile' })}>
            <Plus />
          </IconButton>
          <IconButton
            label="Duplicate profile"
            onClick={() => void run(() => window.fightingGameStick.duplicateProfile(activeProfile.id), 'Profile duplicated.')}
          >
            <Copy />
          </IconButton>
          <IconButton label="Rename profile" onClick={() => setProfileDialog({ mode: 'rename', initial: activeProfile.name })}>
            <Pencil />
          </IconButton>
          <IconButton
            label={deleteArmed ? 'Confirm delete' : 'Delete profile'}
            className={deleteArmed ? 'danger-action' : ''}
            disabled={snapshot.profiles.length === 1}
            onClick={() => {
              if (!deleteArmed) return setDeleteArmed(true);
              setDeleteArmed(false);
              void run(() => window.fightingGameStick.deleteProfile(activeProfile.id), 'Profile deleted.');
            }}
          >
            <Trash2 />
          </IconButton>
        </div>

        <button className="diagnostics-button" onClick={() => setDiagnosticsOpen(true)}>
          <Settings2 />
          Diagnostics
        </button>

        <button
          className={`power-button ${runtime.enabled ? 'power-active' : ''}`}
          disabled={busy || (!['ready', 'demo'].includes(runtime.helperState) && !runtime.enabled)}
          onClick={() => void run(() => window.fightingGameStick.setEnabled(!runtime.enabled))}
        >
          <Power />
          {runtime.enabled ? 'Pause' : 'Enable'}
        </button>
      </header>

      <main className="workspace">
        <aside className="keyboard-column">
          <section className="panel live-input-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Input monitor</span>
                <h2>Keyboard + mouse</h2>
              </div>
              <span className="input-icons" aria-hidden="true">
                <Keyboard />
                <MousePointer2 />
              </span>
            </div>
            <div className="pressed-keys" aria-live="polite">
              {snapshot.pressedKeys.length ? (
                snapshot.pressedKeys.map((key) => (
                  <div className="pressed-key" key={`${key.scanCode}:${key.extended}`}>
                    <kbd>{key.label}</kbd>
                    <span>{key.mappedTarget ? bindingTargetShortLabel(key.mappedTarget) : 'Unmapped'}</span>
                  </div>
                ))
              ) : (
                <div className="empty-input">
                  <span className="empty-keycap">···</span>
                  <p>Press a key or enabled mouse button.</p>
                </div>
              )}
            </div>
            <div className="rollover-meter">
              <span>Simultaneous inputs</span>
              <strong>{snapshot.pressedKeys.length}</strong>
            </div>
            <p className="helper-copy">
              Hold your most demanding combo here. Missing keyboard keys indicate hardware ghosting, not a software delay.
            </p>
          </section>

          <section className="panel mappings-panel">
            <div className="section-heading compact-heading">
              <div>
                <span className="eyebrow">Active profile</span>
                <h2>Bindings</h2>
              </div>
              <span className="binding-count">{activeProfile.bindings.length}</span>
            </div>
            <ControllerChordBuilder profile={activeProfile} onTarget={bind} run={run} />
            <div className="mapping-list">
              {allTargets.map((target) => {
                const bindings = activeProfile.bindings.filter((binding) => binding.target === target);
                return (
                  <div className="mapping-row" key={target}>
                    <button className="mapping-target" onClick={() => bind(target)}>
                      <span className={`target-light ${isTargetActive(snapshot.controller, target) ? 'active' : ''}`} />
                      <span>{targetLabels[target]}</span>
                    </button>
                    <div className="key-chips">
                      {bindings.length ? (
                        bindings.map((binding) => (
                          <span className="key-chip" key={binding.id}>
                            <kbd>{binding.source.label}</kbd>
                            <button
                              aria-label={`Remove ${binding.source.label} from ${targetLabels[target]}`}
                              onClick={() => void run(() => window.fightingGameStick.removeBinding(binding.id))}
                            >
                              <X />
                            </button>
                          </span>
                        ))
                      ) : (
                        <button className="add-key-chip" onClick={() => bind(target)} aria-label={`Bind ${targetLabels[target]}`}>
                          <Plus />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="device-stage">
          <div className="stage-heading">
            <div>
              <span className="eyebrow">One virtual controller · two views</span>
              <h1>See every input before the round starts.</h1>
              <p>Click any control, then press a keyboard key or enabled mouse button. Both views represent the same XInput device.</p>
            </div>
            <div className="input-toggles">
              <label className="input-toggle">
                <span>
                  <strong>Mouse support</strong>
                  <small>{runtime.mouseEnabled ? 'Mouse buttons can be mapped' : 'Off by default for safety'}</small>
                </span>
                <input
                  type="checkbox"
                  aria-label="Mouse support"
                  checked={runtime.mouseEnabled}
                  onChange={(event) => void run(() => window.fightingGameStick.setMouseEnabled(event.target.checked))}
                />
                <span className="switch-track" aria-hidden="true"><span /></span>
              </label>
              <label className="input-toggle">
                <span>
                  <strong>Input pass-through</strong>
                  <small>{runtime.passthrough ? 'Game sees both inputs' : 'Game sees controller only'}</small>
                </span>
                <input
                  type="checkbox"
                  aria-label="Input pass-through"
                  checked={runtime.passthrough}
                  onChange={(event) => void run(() => window.fightingGameStick.setPassthrough(event.target.checked))}
                />
                <span className="switch-track" aria-hidden="true"><span /></span>
              </label>
            </div>
          </div>

          <div className="devices-grid">
            <DeviceCard icon={<Gamepad2 />} label="Controller view" subtitle="Xbox 360 · XInput">
              <GamepadVisual state={snapshot.controller} onTarget={bind} />
            </DeviceCard>
            <DeviceCard icon={<ArcadeIcon />} label="Fight stick view" subtitle="Eight-button layout">
              <FightStickVisual state={snapshot.controller} onTarget={bind} />
            </DeviceCard>
          </div>

          <MotionShortcutsPanel profile={activeProfile} onTarget={bind} run={run} />

          <div className={`safety-strip ${runtime.enabled ? 'safety-live' : ''}`}>
            {runtime.enabled ? <ShieldCheck /> : <ShieldAlert />}
            <div>
              <strong>{runtime.enabled ? 'Mapping is live' : 'Mapping is safely paused'}</strong>
              <span>
                {runtime.enabled
                  ? runtime.passthrough
                    ? 'Mapped inputs pass through. Ctrl + Alt + F12 instantly pauses output.'
                    : 'Mapped keyboard keys and enabled mouse buttons are blocked. Ctrl + Alt + F12 restores them.'
                  : 'No inputs are blocked and all controller outputs are neutral.'}
              </span>
            </div>
            <span className="sequence">Report {snapshot.controller.sequence}</span>
          </div>
        </section>
      </main>

      {snapshot.captureTarget && (
        <CaptureOverlay target={snapshot.captureTarget} onCancel={() => void window.fightingGameStick.cancelCapture()} />
      )}
      {diagnosticsOpen && (
        <DiagnosticsDrawer
          snapshot={snapshot}
          onClose={() => setDiagnosticsOpen(false)}
          run={run}
        />
      )}
      {profileDialog && (
        <ProfileNameDialog
          dialog={profileDialog}
          onCancel={() => setProfileDialog(null)}
          onSubmit={submitProfileDialog}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function IconButton({
  label,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

function DeviceCard({ children, icon, label, subtitle }: React.PropsWithChildren<{ icon: React.ReactNode; label: string; subtitle: string }>) {
  return (
    <article className="device-card">
      <header>
        <span className="device-icon">{icon}</span>
        <div>
          <h2>{label}</h2>
          <span>{subtitle}</span>
        </div>
      </header>
      <div className="device-canvas">{children}</div>
    </article>
  );
}

function GamepadVisual({ state, onTarget }: { state: ControllerState; onTarget: (target: ControllerTarget) => void }) {
  const active = (target: ControllerTarget) => isTargetActive(state, target);
  const hit = (target: ControllerTarget, label: string) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': `Bind ${label}`,
    'aria-pressed': active(target),
    className: `svg-control ${active(target) ? 'is-active' : ''}`,
    onClick: () => onTarget(target),
    onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
      if (event.key === 'Enter' || event.key === ' ') onTarget(target);
    },
  });

  return (
    <svg className="gamepad-svg" viewBox="0 0 560 350" aria-label="Interactive Xbox controller">
      <defs>
        <filter id="gamepad-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#000" floodOpacity=".36" />
        </filter>
      </defs>
      <path
        className="gamepad-body"
        filter="url(#gamepad-shadow)"
        d="M111 91c31-33 76-47 169-47s138 14 169 47c30 33 60 96 72 156 9 45-6 69-35 69-25 0-48-26-76-70-17-27-38-35-67-28-38 9-88 9-126 0-29-7-50 1-67 28-28 44-51 70-76 70-29 0-44-24-35-69 12-60 42-123 72-156Z"
      />
      <path className="gamepad-highlight" d="M115 96c40-37 82-43 165-43s125 6 165 43" />

      <g {...hit('lt', 'left trigger')}><rect x="104" y="43" width="90" height="34" rx="14" /><text x="149" y="65">LT</text></g>
      <g {...hit('rt', 'right trigger')}><rect x="366" y="43" width="90" height="34" rx="14" /><text x="411" y="65">RT</text></g>
      <g {...hit('lb', 'left bumper')}><path d="M105 80h92l-11 33h-91c0-13 3-24 10-33Z" /><text x="148" y="101">LB</text></g>
      <g {...hit('rb', 'right bumper')}><path d="M363 80h92c7 9 10 20 10 33h-91Z" /><text x="412" y="101">RB</text></g>

      <g transform={`translate(${state.leftStick.x * 9} ${state.leftStick.y * 9})`}>
        <circle className="stick-well" cx="176" cy="151" r="48" />
        <g {...hit('left-stick-click', 'left stick click')}><circle cx="176" cy="151" r="31" /><circle className="stick-ring" cx="176" cy="151" r="22" /></g>
      </g>
      <g {...hit('left-stick-up', 'left stick up')}><circle className="stick-direction" cx="176" cy="107" r="9" /></g>
      <g {...hit('left-stick-down', 'left stick down')}><circle className="stick-direction" cx="176" cy="195" r="9" /></g>
      <g {...hit('left-stick-left', 'left stick left')}><circle className="stick-direction" cx="132" cy="151" r="9" /></g>
      <g {...hit('left-stick-right', 'left stick right')}><circle className="stick-direction" cx="220" cy="151" r="9" /></g>

      <g className="dpad" transform="translate(162 231)">
        <g {...hit('dpad-up', 'D-pad up')}><path d="M25 0h34v41H25Z" /></g>
        <g {...hit('dpad-down', 'D-pad down')}><path d="M25 59h34v41H25Z" /></g>
        <g {...hit('dpad-left', 'D-pad left')}><path d="M-16 33h41v34h-41Z" /></g>
        <g {...hit('dpad-right', 'D-pad right')}><path d="M59 33h41v34H59Z" /></g>
        <rect className="dpad-center" x="25" y="33" width="34" height="34" />
      </g>

      <g {...hit('back', 'Back')}><rect x="244" y="141" width="31" height="18" rx="9" /><text x="259" y="155">◀</text></g>
      <g {...hit('start', 'Start')}><rect x="285" y="141" width="31" height="18" rx="9" /><text x="301" y="155">▶</text></g>
      <circle className="guide-button" cx="280" cy="105" r="25" /><path className="guide-mark" d="M268 105h24M280 93v24" />

      <g {...hit('y', 'Y')}><circle className="face y" cx="414" cy="124" r="24" /><text x="414" y="131">Y</text></g>
      <g {...hit('x', 'X')}><circle className="face x" cx="374" cy="164" r="24" /><text x="374" y="171">X</text></g>
      <g {...hit('b', 'B')}><circle className="face b" cx="454" cy="164" r="24" /><text x="454" y="171">B</text></g>
      <g {...hit('a', 'A')}><circle className="face a" cx="414" cy="204" r="24" /><text x="414" y="211">A</text></g>

      <g transform={`translate(${state.rightStick.x * 8} ${state.rightStick.y * 8})`}>
        <circle className="stick-well small" cx="339" cy="246" r="40" />
        <g {...hit('right-stick-click', 'right stick click')}><circle cx="339" cy="246" r="27" /><circle className="stick-ring" cx="339" cy="246" r="18" /></g>
      </g>
      <g {...hit('right-stick-up', 'right stick up')}><circle className="stick-direction" cx="339" cy="210" r="8" /></g>
      <g {...hit('right-stick-down', 'right stick down')}><circle className="stick-direction" cx="339" cy="282" r="8" /></g>
      <g {...hit('right-stick-left', 'right stick left')}><circle className="stick-direction" cx="303" cy="246" r="8" /></g>
      <g {...hit('right-stick-right', 'right stick right')}><circle className="stick-direction" cx="375" cy="246" r="8" /></g>
    </svg>
  );
}

function FightStickVisual({ state, onTarget }: { state: ControllerState; onTarget: (target: ControllerTarget) => void }) {
  const leverPose = getFightStickLeverPose(state);
  const buttons: Array<{ target: ControllerTarget; x: number; y: number; color: string }> = [
    { target: 'x', x: 342, y: 132, color: 'blue' },
    { target: 'y', x: 404, y: 118, color: 'yellow' },
    { target: 'rb', x: 468, y: 128, color: 'neutral' },
    { target: 'lb', x: 525, y: 153, color: 'neutral' },
    { target: 'a', x: 347, y: 201, color: 'green' },
    { target: 'b', x: 411, y: 188, color: 'red' },
    { target: 'rt', x: 477, y: 198, color: 'neutral' },
    { target: 'lt', x: 535, y: 224, color: 'neutral' },
  ];

  return (
    <svg className="fight-stick-svg" viewBox="0 0 620 350" aria-label="Interactive eight-button fight stick">
      <defs>
        <filter id="stick-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#000" floodOpacity=".38" />
        </filter>
      </defs>
      <path className="fight-case" filter="url(#stick-shadow)" d="M47 86Q54 53 91 50h440q37 3 44 36l25 191q4 31-29 31H49q-33 0-29-31Z" />
      <path className="fight-deck" d="M55 90Q62 64 91 63h438q29 1 36 27l19 143H36Z" />
      <path className="deck-line" d="M36 238h548" />

      <g className="lever" style={{ transform: `rotate(${leverPose.rotation}deg) scaleY(${leverPose.verticalScale})` }}>
        <path d="M171 224 156 120h30Z" />
        <circle className="lever-ball" cx="171" cy="102" r="39" />
        <circle className="lever-shine" cx="157" cy="88" r="10" />
      </g>
      <ellipse className="lever-gate" cx="171" cy="231" rx="72" ry="32" />
      <circle className="lever-boot" cx="171" cy="230" r="39" />

      <DirectionHit target="dpad-up" x={171} y={49} label="D-pad up" state={state} onTarget={onTarget} symbol="↑" />
      <DirectionHit target="dpad-down" x={171} y={285} label="D-pad down" state={state} onTarget={onTarget} symbol="↓" />
      <DirectionHit target="dpad-left" x={72} y={176} label="D-pad left" state={state} onTarget={onTarget} symbol="←" />
      <DirectionHit target="dpad-right" x={270} y={176} label="D-pad right" state={state} onTarget={onTarget} symbol="→" />

      {buttons.map(({ target, x, y, color }) => (
        <g
          key={target}
          role="button"
          tabIndex={0}
          aria-label={`Bind ${targetLabels[target]}`}
          aria-pressed={isTargetActive(state, target)}
          className={`arcade-button arcade-${color} ${isTargetActive(state, target) ? 'is-active' : ''}`}
          onClick={() => onTarget(target)}
          onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && onTarget(target)}
        >
          <circle className="button-rim" cx={x} cy={y} r="31" />
          <circle className="button-cap" cx={x} cy={y - 2} r="24" />
          <text x={x} y={y + 4}>{targetShortLabels[target]}</text>
        </g>
      ))}
      <g className="utility-buttons">
        <g role="button" tabIndex={0} aria-label="Bind Back" aria-pressed={state.buttons.back} onClick={() => onTarget('back')} onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && onTarget('back')}><circle cx="82" cy="280" r="14" className={state.buttons.back ? 'active' : ''} /><text x="82" y="308">BACK</text></g>
        <g role="button" tabIndex={0} aria-label="Bind Start" aria-pressed={state.buttons.start} onClick={() => onTarget('start')} onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && onTarget('start')}><circle cx="118" cy="280" r="14" className={state.buttons.start ? 'active' : ''} /><text x="118" y="308">START</text></g>
      </g>
      <text className="case-label" x="530" y="286">FGS / 01</text>
    </svg>
  );
}

function ControllerChordBuilder({ profile, onTarget, run }: {
  profile: MappingProfile;
  onTarget: (target: BindingTarget) => void;
  run: (action: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<ControllerChordButton[]>(['a', 'b']);
  const assignments = profile.bindings.filter((binding) => isControllerChordTarget(binding.target));

  const toggleButton = (button: ControllerChordButton) => {
    setSelected((current) => current.includes(button)
      ? current.filter((item) => item !== button)
      : controllerChordButtons.filter((item) => item === button || current.includes(item)));
  };

  const summary = selected.length
    ? selected.map((button) => button.toUpperCase()).join(' + ')
    : 'Select buttons';

  return (
    <section className="controller-chord-builder" aria-labelledby="controller-chord-title">
      <header>
        <div>
          <span className="eyebrow">One physical input</span>
          <h3 id="controller-chord-title">Multi-button output</h3>
        </div>
        <output>{summary}</output>
      </header>
      <div className="controller-chord-buttons" role="group" aria-label="Controller chord buttons">
        {controllerChordButtons.map((button) => {
          const isSelected = selected.includes(button);
          return (
            <button
              className={isSelected ? 'is-selected' : ''}
              key={button}
              aria-label={`Toggle ${button.toUpperCase()} for controller chord`}
              aria-pressed={isSelected}
              onClick={() => toggleButton(button)}
            >
              {button.toUpperCase()}
            </button>
          );
        })}
      </div>
      <button
        className="controller-chord-bind"
        disabled={selected.length < 2}
        aria-label={selected.length >= 2 ? `Bind ${summary}` : 'Select at least two controller buttons'}
        onClick={() => onTarget(createControllerChordTarget(selected))}
      >
        <Plus />
        {selected.length >= 2 ? `Bind ${summary}` : 'Choose at least two buttons'}
      </button>
      <div className="controller-chord-assignments" aria-label="Assigned multi-button bindings">
        {assignments.length ? assignments.map((binding) => {
          const target = binding.target as ControllerChordTarget;
          return (
            <div className="controller-chord-assignment" key={binding.id}>
              <kbd>{binding.source.label}</kbd>
              <span>{controllerChordLabel(target)}</span>
              <button
                aria-label={`Remove ${binding.source.label} from ${controllerChordLabel(target)}`}
                title={`Remove ${binding.source.label}`}
                onClick={() => void run(() => window.fightingGameStick.removeBinding(binding.id))}
              >
                <X />
              </button>
            </div>
          );
        }) : (
          <p>No multi-button bindings yet.</p>
        )}
      </div>
    </section>
  );
}

function DirectionHit({ target, x, y, label, state, onTarget, symbol }: {
  target: ControllerTarget; x: number; y: number; label: string; state: ControllerState;
  onTarget: (target: ControllerTarget) => void; symbol: string;
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Bind ${label}`}
      aria-pressed={isTargetActive(state, target)}
      className={`direction-hit ${isTargetActive(state, target) ? 'is-active' : ''}`}
      onClick={() => onTarget(target)}
      onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && onTarget(target)}
    >
      <circle cx={x} cy={y} r="19" />
      <text x={x} y={y + 6}>{symbol}</text>
    </g>
  );
}

function MotionShortcutsPanel({ profile, onTarget, run }: {
  profile: MappingProfile;
  onTarget: (target: BindingTarget) => void;
  run: (action: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const [selectedAttacks, setSelectedAttacks] = useState<Record<QuarterCircleMotion, MotionAttack[]>>({
    qcf: ['a'],
    qcb: ['a'],
  });
  const motions = [
    { id: 'qcf', name: 'Quarter-circle forward', notation: '↓  ↘  →' },
    { id: 'qcb', name: 'Quarter-circle back', notation: '↓  ↙  ←' },
  ] as const;

  const toggleAttack = (motion: QuarterCircleMotion, attack: MotionAttack) => {
    setSelectedAttacks((current) => ({
      ...current,
      [motion]: current[motion].includes(attack)
        ? current[motion].filter((item) => item !== attack)
        : motionAttacks.filter((item) => item === attack || current[motion].includes(item)),
    }));
  };

  return (
    <section className="motion-panel" aria-labelledby="motion-shortcuts-title">
      <header className="motion-panel-heading">
        <span className="device-icon"><Route /></span>
        <div>
          <span className="eyebrow">One-key commands</span>
          <h2 id="motion-shortcuts-title">Motion shortcuts</h2>
          <p>Bind QCF or QCB by itself, or add any attack-button chord. Check your game or tournament rules before use.</p>
        </div>
      </header>
      <div className="motion-groups">
        {motions.map((motion) => (
          <article className="motion-group" key={motion.id}>
            <header>
              <div><strong>{motion.id.toUpperCase()}</strong><span>{motion.name}</span></div>
              <code aria-label={`${motion.name}: ${motion.notation}`}>{motion.notation}</code>
            </header>
            <div className="motion-builder">
              <div className="motion-chord-summary">
                <span>Attack output</span>
                <output>
                  {selectedAttacks[motion.id].length
                    ? selectedAttacks[motion.id].map((attack) => attack.toUpperCase()).join(' + ')
                    : 'Motion only'}
                </output>
              </div>
              <div className="motion-chord-buttons" role="group" aria-label={`${motion.id.toUpperCase()} attack chord`}>
                {motionAttacks.map((attack) => {
                  const selected = selectedAttacks[motion.id].includes(attack);
                  return (
                    <button
                      className={selected ? 'is-selected' : ''}
                      key={attack}
                      aria-label={`Toggle ${attack.toUpperCase()} for ${motion.id.toUpperCase()} chord`}
                      aria-pressed={selected}
                      onClick={() => toggleAttack(motion.id, attack)}
                    >
                      {attack.toUpperCase()}
                    </button>
                  );
                })}
              </div>
              <button
                className="motion-bind-combo"
                aria-label={selectedAttacks[motion.id].length
                  ? `Bind ${motion.id.toUpperCase()} + ${selectedAttacks[motion.id].map((attack) => attack.toUpperCase()).join(' + ')}`
                  : `Bind ${motion.id.toUpperCase()}`}
                onClick={() => onTarget(createMotionShortcutTarget(motion.id, selectedAttacks[motion.id]))}
              >
                <Plus />
                {selectedAttacks[motion.id].length ? 'Bind command to an input' : 'Bind motion to an input'}
              </button>
            </div>
            <div className="motion-assignments">
              <div className="motion-assignments-heading">
                <span>Assigned shortcuts</span>
                <small>{profile.bindings.filter((binding) => isMotionShortcutTarget(binding.target) && parseMotionShortcut(binding.target).motion === motion.id).length}</small>
              </div>
              <div className="motion-assignment-list">
                {profile.bindings
                  .filter((binding) => isMotionShortcutTarget(binding.target) && parseMotionShortcut(binding.target).motion === motion.id)
                  .map((binding) => {
                    const target = binding.target as MotionShortcutTarget;
                    return (
                      <div className="motion-assignment" key={binding.id}>
                        <kbd>{binding.source.label}</kbd>
                        <span>{bindingTargetLabel(target)}</span>
                        <button
                          aria-label={`Remove ${binding.source.label} from ${bindingTargetLabel(target)}`}
                          title={`Remove ${binding.source.label}`}
                          onClick={() => void run(() => window.fightingGameStick.removeBinding(binding.id))}
                        >
                          <X />
                        </button>
                      </div>
                    );
                  })}
                {!profile.bindings.some((binding) => isMotionShortcutTarget(binding.target) && parseMotionShortcut(binding.target).motion === motion.id) && (
                  <p>No shortcuts assigned yet.</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CaptureOverlay({ target, onCancel }: { target: BindingTarget; onCancel: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="capture-card" role="dialog" aria-modal="true" aria-labelledby="capture-title">
        <button className="modal-close" onClick={onCancel} aria-label="Cancel binding"><X /></button>
        <div className="capture-rings" aria-hidden="true"><span /><span /><kbd>?</kbd></div>
        <span className="eyebrow">Listening for an input</span>
        <h2 id="capture-title">Bind {bindingTargetLabel(target)}</h2>
        <p>
          Press the keyboard key or mouse button you want to use. Mouse support must be on; an occupied input moves here.
        </p>
        <button className="secondary-button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function DiagnosticsDrawer({ snapshot, onClose, run }: {
  snapshot: AppSnapshot; onClose: () => void;
  run: (action: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const actionFor = (diagnostic: DiagnosticResult) => {
    switch (diagnostic.action) {
      case 'install-driver':
        return () => void run(() => window.fightingGameStick.installDriver(), 'Driver installer opened.');
      case 'open-controller-panel':
        return () => void run(() => window.fightingGameStick.openControllerPanel());
      case 'recheck':
        return () => void run(() => window.fightingGameStick.recheck(), 'Connection rechecked.');
      default:
        return undefined;
    }
  };
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="diagnostics-drawer" role="dialog" aria-modal="true" aria-labelledby="diagnostics-title">
        <header>
          <div>
            <span className="eyebrow">System health</span>
            <h2 id="diagnostics-title">Diagnostics</h2>
          </div>
          <IconButton label="Close diagnostics" onClick={onClose}><X /></IconButton>
        </header>
        <div className="diagnostic-list">
          {snapshot.diagnostics.map((diagnostic) => {
            const action = actionFor(diagnostic);
            return (
              <article className={`diagnostic diagnostic-${diagnostic.status}`} key={diagnostic.id}>
                <span className="diagnostic-icon">
                  {diagnostic.status === 'pass' ? <ShieldCheck /> : diagnostic.status === 'fail' ? <ShieldAlert /> : <Activity />}
                </span>
                <div>
                  <h3>{diagnostic.label}</h3>
                  <p>{diagnostic.detail}</p>
                  {action && (
                    <button className="inline-action" onClick={action}>
                      {diagnostic.action === 'install-driver' ? <Download /> : <RefreshCw />}
                      {diagnostic.action === 'install-driver' ? 'Install signed driver' : diagnostic.action === 'open-controller-panel' ? 'Open controller panel' : 'Recheck'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <section className="log-section">
          <div className="log-heading"><h3>Recent activity</h3><span>{snapshot.logs.length} entries</span></div>
          <div className="log-list">
            {snapshot.logs.length ? snapshot.logs.map((line, index) => <code key={`${line}-${index}`}>{line}</code>) : <p>No activity yet.</p>}
          </div>
        </section>
        <footer>
          <strong>Emergency shortcut</strong>
          <kbd>Ctrl</kbd><span>+</span><kbd>Alt</kbd><span>+</span><kbd>F12</kbd>
        </footer>
      </aside>
    </div>
  );
}

function ProfileNameDialog({ dialog, onCancel, onSubmit }: { dialog: NonNullable<ProfileDialog>; onCancel: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(dialog.initial);
  return (
    <div className="modal-backdrop">
      <form className="name-dialog" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSubmit(name.trim()); }}>
        <span className="eyebrow">Profile</span>
        <h2>{dialog.mode === 'new' ? 'Create a profile' : 'Rename profile'}</h2>
        <label><span>Name</span><input autoFocus maxLength={48} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={!name.trim()}>Save</button></div>
      </form>
    </div>
  );
}

function LoadingScreen() {
  return <div className="loading-screen"><div className="loading-mark"><Gamepad2 /></div><p>Connecting controls…</p></div>;
}

function ArcadeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 19h10M9 19l1-7h4l1 7M12 12V5m0 0-2-2m2 2 2-2M17 8h.01M20 11h.01" /></svg>;
}

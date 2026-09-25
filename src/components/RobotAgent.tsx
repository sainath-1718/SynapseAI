// ============================================================
// Synapse AI — RobotAgent Component
// Animated SVG robot with 7 visual states.
// ============================================================

import { memo } from 'react';
import type { AgentDefinition, AgentState, AgentStatus } from '@/types';

interface RobotAgentProps {
  definition: AgentDefinition;
  state: AgentState;
  isCurrent: boolean;
  onClick: () => void;
}

const STATUS_CONFIG: Record<
  AgentStatus,
  {
    color: string;
    glow: string;
    label: string;
    ringClass: string;
    bgClass: string;
  }
> = {
  idle: {
    color: '#475569',
    glow: '',
    label: 'IDLE',
    ringClass: 'border-slate-700/50',
    bgClass: 'bg-slate-900/40',
  },
  analyzing: {
    color: '#fbbf24',
    glow: 'shadow-[0_0_20px_0_rgba(251,191,36,0.5)]',
    label: 'ANALYZING',
    ringClass: 'border-amber-400/60',
    bgClass: 'bg-amber-950/20',
  },
  working: {
    color: '#00ff88',
    glow: 'shadow-glow animate-pulse-glow',
    label: 'WORKING',
    ringClass: 'border-synapse-500/70',
    bgClass: 'bg-synapse-950/30',
  },
  communicating: {
    color: '#38bdf8',
    glow: 'shadow-[0_0_20px_0_rgba(56,189,248,0.5)]',
    label: 'COMMUNICATING',
    ringClass: 'border-sky-400/60',
    bgClass: 'bg-sky-950/20',
  },
  waiting: {
    color: '#a78bfa',
    glow: 'shadow-[0_0_12px_0_rgba(167,139,250,0.3)]',
    label: 'WAITING',
    ringClass: 'border-violet-400/40',
    bgClass: 'bg-violet-950/20',
  },
  success: {
    color: '#00ff88',
    glow: 'shadow-glow-sm',
    label: 'SUCCESS',
    ringClass: 'border-synapse-500/50',
    bgClass: 'bg-synapse-950/20',
  },
  error: {
    color: '#fb7185',
    glow: 'shadow-[0_0_16px_0_rgba(251,113,133,0.4)]',
    label: 'ERROR',
    ringClass: 'border-rose-500/60',
    bgClass: 'bg-rose-950/20',
  },
};

function RobotSVG({
  status,
  color,
}: {
  status: AgentStatus;
  color: string;
}) {
  const isActive = status === 'working' || status === 'analyzing';
  const isCommunicating = status === 'communicating';
  const isError = status === 'error';
  const isSuccess = status === 'success';
  const isWaiting = status === 'waiting';

  // Eye state
  const eyeFill = isError ? '#fb7185' : isSuccess ? '#00ff88' : color;
  const eyeClass =
    isActive || isCommunicating
      ? 'animate-blink-eye'
      : '';

  // Antenna light
  const antennaColor = isError ? '#fb7185' : color;
  const antennaPulse =
    isActive || isCommunicating
      ? 'animate-pulse-glow'
      : isSuccess
        ? ''
        : '';

  // Scan line for analyzing state
  const showScan = status === 'analyzing' || status === 'working';

  // Communication waves
  const showWaves = isCommunicating;

  // Waiting — dim eyes
  const eyeOpacity = isWaiting ? 0.4 : 1;

  return (
    <svg
      viewBox="0 0 120 100"
      className="w-full h-full"
      style={{ filter: `drop-shadow(0 0 ${isActive ? 8 : 4}px ${color}40)` }}
    >
      {/* Communication waves */}
      {showWaves && (
        <>
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx="60"
              cy="35"
              r={20 + i * 8}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              opacity={0.4 - i * 0.12}
              style={{
                animation: `data-flow 1.5s ease-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </>
      )}

      {/* Antenna */}
      <line
        x1="60"
        y1="20"
        x2="60"
        y2="10"
        stroke={color}
        strokeWidth="2"
        opacity={isWaiting ? 0.4 : 0.8}
      />
      <circle
        cx="60"
        cy="8"
        r="3"
        fill={antennaColor}
        className={antennaPulse}
        opacity={isWaiting ? 0.4 : 1}
      >
        {(isActive || isCommunicating) && (
          <animate
            attributeName="opacity"
            values="0.5;1;0.5"
            dur="1s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* Head/Body container */}
      <rect
        x="28"
        y="20"
        width="64"
        height="55"
        rx="12"
        fill="rgba(10,18,16,0.8)"
        stroke={color}
        strokeWidth="1.5"
        opacity={isWaiting ? 0.5 : 0.9}
      />

      {/* Side panels (ears) */}
      <rect
        x="22"
        y="35"
        width="6"
        height="20"
        rx="3"
        fill="rgba(10,18,16,0.8)"
        stroke={color}
        strokeWidth="1"
        opacity={isWaiting ? 0.3 : 0.7}
      />
      <rect
        x="92"
        y="35"
        width="6"
        height="20"
        rx="3"
        fill="rgba(10,18,16,0.8)"
        stroke={color}
        strokeWidth="1"
        opacity={isWaiting ? 0.3 : 0.7}
      />

      {/* Eye screen background */}
      <rect
        x="36"
        y="30"
        width="48"
        height="18"
        rx="6"
        fill="rgba(0,0,0,0.6)"
        stroke={color}
        strokeWidth="0.5"
        opacity={isWaiting ? 0.3 : 0.6}
      />

      {/* Left eye */}
      <g className={eyeClass} style={{ transformOrigin: '46px 39px' }}>
        {isError ? (
          // X eyes for error
          <>
            <line x1="42" y1="35" x2="50" y2="43" stroke={eyeFill} strokeWidth="2" strokeLinecap="round" opacity={eyeOpacity} />
            <line x1="50" y1="35" x2="42" y2="43" stroke={eyeFill} strokeWidth="2" strokeLinecap="round" opacity={eyeOpacity} />
          </>
        ) : isSuccess ? (
          // Happy curved eyes
          <path d="M 42 41 Q 46 37 50 41" fill="none" stroke={eyeFill} strokeWidth="2" strokeLinecap="round" opacity={eyeOpacity} />
        ) : (
          <circle cx="46" cy="39" r="3.5" fill={eyeFill} opacity={eyeOpacity}>
            {isActive && (
              <animate
                attributeName="r"
                values="3.5;2;3.5"
                dur="2s"
                repeatCount="indefinite"
              />
            )}
          </circle>
        )}
      </g>

      {/* Right eye */}
      <g className={eyeClass} style={{ transformOrigin: '74px 39px' }}>
        {isError ? (
          <>
            <line x1="70" y1="35" x2="78" y2="43" stroke={eyeFill} strokeWidth="2" strokeLinecap="round" opacity={eyeOpacity} />
            <line x1="78" y1="35" x2="70" y2="43" stroke={eyeFill} strokeWidth="2" strokeLinecap="round" opacity={eyeOpacity} />
          </>
        ) : isSuccess ? (
          <path d="M 70 41 Q 74 37 78 41" fill="none" stroke={eyeFill} strokeWidth="2" strokeLinecap="round" opacity={eyeOpacity} />
        ) : (
          <circle cx="74" cy="39" r="3.5" fill={eyeFill} opacity={eyeOpacity}>
            {isActive && (
              <animate
                attributeName="r"
                values="3.5;2;3.5"
                dur="2s"
                repeatCount="indefinite"
              />
            )}
          </circle>
        )}
      </g>

      {/* Scan line for analyzing */}
      {showScan && (
        <rect
          x="36"
          y="30"
          width="48"
          height="2"
          fill={color}
          opacity="0.8"
          style={{
            animation: 'scan-down 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Mouth / status bar */}
      <rect
        x="42"
        y="55"
        width="36"
        height="6"
        rx="3"
        fill="rgba(0,0,0,0.5)"
        stroke={color}
        strokeWidth="0.5"
        opacity={isWaiting ? 0.3 : 0.5}
      />
      {/* Mouth segments */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={44 + i * 7}
          y="57"
          width="4"
          height="2"
          rx="1"
          fill={color}
          opacity={
            isActive
              ? 0.3 + Math.abs(Math.sin(Date.now() / 200 + i)) * 0.7
              : isError
                ? 0.8
                : 0.4
          }
        >
          {isActive && (
            <animate
              attributeName="opacity"
              values="0.2;0.8;0.2"
              dur="0.8s"
              begin={`${i * 0.15}s`}
              repeatCount="indefinite"
            />
          )}
        </rect>
      ))}

      {/* Body lower section */}
      <rect
        x="35"
        y="68"
        width="50"
        height="5"
        rx="2.5"
        fill="rgba(0,0,0,0.4)"
        stroke={color}
        strokeWidth="0.5"
        opacity={isWaiting ? 0.2 : 0.4}
      />

      {/* Status light (bottom) */}
      <circle
        cx="60"
        cy="84"
        r="3"
        fill={color}
        opacity={isWaiting ? 0.3 : 0.8}
        className={isActive || isCommunicating ? 'animate-pulse' : ''}
      >
        {(isActive || isCommunicating || isError) && (
          <animate
            attributeName="opacity"
            values="0.3;1;0.3"
            dur="1.2s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* Base connector */}
      <line
        x1="60"
        y1="75"
        x2="60"
        y2="81"
        stroke={color}
        strokeWidth="1"
        opacity={isWaiting ? 0.3 : 0.6}
      />
    </svg>
  );
}

function RobotAgentComponent({ definition, state, isCurrent, onClick }: RobotAgentProps) {
  const config = STATUS_CONFIG[state.status];
  const isIdle = state.status === 'idle';
  const isActive = state.status === 'working' || state.status === 'analyzing' || state.status === 'communicating';

  return (
    <button
      onClick={onClick}
      className={`group relative w-full rounded-2xl border-2 ${config.ringClass} ${config.bgClass} ${config.glow} transition-all duration-300 hover:scale-[1.02] hover:border-synapse-500/60 overflow-hidden`}
      style={{ minHeight: '200px' }}
    >
      {/* Grid background */}
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />

      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor: config.color, opacity: 0.6 }} />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: config.color, opacity: 0.6 }} />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: config.color, opacity: 0.6 }} />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor: config.color, opacity: 0.6 }} />

      <div className="relative flex flex-col items-center p-4 gap-2">
        {/* Robot SVG */}
        <div className="w-28 h-24 relative">
          <RobotSVG status={state.status} color={config.color} />
        </div>

        {/* Agent name */}
        <div className="text-center">
          <h3
            className="font-semibold text-sm tracking-wide transition-colors"
            style={{ color: isIdle ? '#94a3b8' : config.color }}
          >
            {definition.name}
          </h3>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
            {definition.role}
          </p>
        </div>

        {/* Status badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wider"
          style={{
            backgroundColor: `${config.color}15`,
            color: config.color,
            border: `1px solid ${config.color}40`,
          }}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${isActive ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: config.color }}
          />
          {config.label}
        </div>

        {/* Current action */}
        {state.currentAction && (
          <p className="text-[11px] text-slate-400 text-center leading-snug font-mono px-2 line-clamp-2 animate-fade-in">
            {state.currentAction}
          </p>
        )}

        {/* Active indicator bar */}
        {isCurrent && (
          <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-synapse-500 to-transparent animate-border-flow" style={{ backgroundSize: '200% 100%' }} />
        )}
      </div>
    </button>
  );
}

export const RobotAgent = memo(RobotAgentComponent);

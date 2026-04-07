import { useState } from 'react';
import { useCollaboration, CollaborationMember } from '../contexts/CollaborationContext';
import { useSocket } from '../contexts/SocketContext';

const MAX_VISIBLE = 5;

function UserAvatar({ member }: { member: CollaborationMember }) {
  const [hovered, setHovered] = useState(false);
  const firstChar = (member.userName || '?')[0].toUpperCase();

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          backgroundColor: member.color || '#6366f1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'default',
          border: '2px solid rgba(255,255,255,0.8)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          flexShrink: 0,
        }}
        title={member.userName}
      >
        {firstChar}
      </div>
      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: -28,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e1e2e',
            color: '#e0e0f0',
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            zIndex: 1200,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {member.userName}
        </div>
      )}
    </div>
  );
}

export default function PresenceBar() {
  const { members } = useCollaboration();
  const { connected } = useSocket();

  if (members.length === 0) {
    return (
      <div style={barStyle}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: connected ? '#22c55e' : '#ef4444',
            flexShrink: 0,
          }}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </div>
    );
  }

  const visible = members.slice(0, MAX_VISIBLE);
  const overflow = members.length - MAX_VISIBLE;

  return (
    <div style={barStyle}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: connected ? '#22c55e' : '#ef4444',
          flexShrink: 0,
          marginRight: 4,
        }}
        title={connected ? 'Connected' : 'Disconnected'}
      />
      {visible.map(m => (
        <UserAvatar key={m.userId} member={m} />
      ))}
      {overflow > 0 && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            backgroundColor: '#4b5563',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#e0e0f0',
            fontSize: 10,
            fontWeight: 600,
            border: '2px solid rgba(255,255,255,0.8)',
            flexShrink: 0,
          }}
          title={members.slice(MAX_VISIBLE).map(m => m.userName).join(', ')}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginLeft: 8,
  marginRight: 4,
};

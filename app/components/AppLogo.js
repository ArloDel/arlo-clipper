import React from 'react';
import Link from 'next/link';

export default function AppLogo({ size = 32, showText = true, textClassName = '', className = '', href = '/' }) {
  const content = (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.65rem',
        textDecoration: 'none',
        cursor: href ? 'pointer' : 'default',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/app_logo.png"
        alt="Arlo Clipper Logo"
        width={size}
        height={size}
        style={{
          borderRadius: '8px',
          objectFit: 'cover',
          display: 'block',
          boxShadow: '0 2px 10px rgba(99, 102, 241, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
        }}
      />
      {showText && (
        <span
          className={textClassName}
          style={{
            fontWeight: 700,
            fontSize: '1.05rem',
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #ffffff 40%, #a5b4fc 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            display: 'inline-block',
          }}
        >
          Arlo Clipper
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {content}
      </Link>
    );
  }

  return content;
}

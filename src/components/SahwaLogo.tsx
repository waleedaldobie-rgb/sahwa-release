// @ts-nocheck
import React from 'react';
import logoUrl from '../assets/sahwa-logo.svg';

export interface SahwaLogoProps {
  className?: string;
  size?: number;
  color?: string;
  fill?: string;
  useGradient?: boolean;
}

/**
 * Unified Sahwa logo used by the application chrome and printable invoices.
 * The SVG asset is kept external so the large traced path data is loaded once
 * by Vite instead of being duplicated in every rendered component.
 */
export const SahwaLogo: React.FC<SahwaLogoProps> = ({
  className = 'w-8 h-8',
  size,
  color = 'currentColor',
  fill,
  useGradient = false,
}) => {
  const logoColor = fill ?? color;
  const dimension = size ? `${size}px` : undefined;
  const logoStyle: React.CSSProperties = {
    display: 'block',
    width: dimension,
    height: dimension,
    backgroundColor: useGradient ? undefined : logoColor,
    backgroundImage: useGradient
      ? 'linear-gradient(135deg, #fbbf24 0%, #d97706 52%, #b45309 100%)'
      : undefined,
    WebkitMaskImage: `url(${logoUrl})`,
    maskImage: `url(${logoUrl})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
  };

  return (
    <span
      className={className}
      style={logoStyle}
      role="img"
      aria-label="شعار صهوة للخياطة"
    />
  );
};

type Props = {
  path: string;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
};

/** Category and tab icons are all single SVG paths on a 24x24 viewBox. */
export function Icon({ path, size = 24, stroke = '#1D2129', strokeWidth = 1.7 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

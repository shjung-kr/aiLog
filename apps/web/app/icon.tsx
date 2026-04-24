import { ImageResponse } from 'next/og';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
          color: '#fbbf24',
          fontSize: 20,
          fontWeight: 700,
          fontFamily: 'Georgia',
        }}
      >
        ai
      </div>
    ),
    size,
  );
}

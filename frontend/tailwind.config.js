/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Khaata brand palette (from DESIGN_SYSTEM.md)
        brand: {
          50: '#ECFDF5',
          600: '#059669',
          700: '#047857',
        },
        // Semantic surface and text colors
        surface: '#FFFFFF',
        background: '#F8FAFC',
        'text-primary': '#0F172A',
        'text-secondary': '#475569',
        border: '#E2E8F0',
        'success-text': '#047857',
        'danger-text': '#B91C1C',
        'danger-bg': '#FEF2F2',
        'warning-text': '#92400E',
        'warning-bg': '#FFFBEB',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Caption
        caption: ['0.8125rem', { lineHeight: '1.4' }],   // 13px
        // Body
        body: ['0.9375rem', { lineHeight: '1.6' }],      // 15px
        // Screen title
        'title-mobile': ['1.5rem', { lineHeight: '1.3' }],   // 24px
        'title-desktop': ['1.875rem', { lineHeight: '1.3' }], // 30px
        // KPI amounts
        'kpi-sm': ['1.5rem', { lineHeight: '1.2' }],    // 24px
        'kpi-lg': ['2rem', { lineHeight: '1.2' }],      // 32px
      },
      spacing: {
        // 4px scale: 4, 8, 12, 16, 24, 32, 48
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        6: '24px',
        8: '32px',
        12: '48px',
      },
      borderRadius: {
        // Card radii per DESIGN_SYSTEM.md
        card: '12px',
        input: '8px',
      },
      maxWidth: {
        content: '1200px',
      },
      width: {
        sidebar: '240px',
      },
      minHeight: {
        // Minimum touch target
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
}

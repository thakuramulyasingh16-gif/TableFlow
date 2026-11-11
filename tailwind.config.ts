import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: 'var(--tf-cream)',
        sun: 'var(--tf-sun)',
        'sun-soft': 'var(--tf-sun-soft)',
        butter: 'var(--tf-butter)',
        mint: 'var(--tf-mint)',
        'mint-bg': 'var(--tf-mint-bg)',
        leaf: 'var(--tf-leaf)',
        'leaf-mid': 'var(--tf-leaf-mid)',
        'veg-green': 'var(--tf-veg-green)',
        tomato: 'var(--tf-tomato)',
        ink: 'var(--tf-ink)',
        muted: 'var(--tf-muted)',
        surface: 'var(--tf-surface)',
        'due-soon': 'var(--tf-due-soon)',
        'due-soon-ink': 'var(--tf-due-soon-ink)',
      },
      fontFamily: {
        sans: ['var(--font-nunito)', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        header: '28px',
      },
      boxShadow: {
        card: '0 6px 18px rgba(31, 107, 58, 0.10)',
        'sun-glow': '0 0 0 6px rgba(255, 217, 61, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;

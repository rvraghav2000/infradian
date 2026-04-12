/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
    	extend: {
    		fontFamily: {
    			sans: [
    				'Inter',
    				'system-ui',
    				'sans-serif'
    			],
    			mono: [
    				'JetBrains Mono',
    				'Fira Code',
    				'monospace'
    			]
    		},
    		colors: {
    			canvas: {
    				bg: '#0a0e1a',
    				grid: '#1a2035'
    			},
    			node: {
    				vpc: '#1e3a5f',
    				'vpc-border': '#2d6da8',
    				subnet: '#1a2f45',
    				'subnet-border': '#3a7cbd',
    				ec2: '#10b981',
    				rds: '#8b5cf6',
    				default: '#6366f1'
    			},
    			load: {
    				low: '#10b981',
    				mid: '#f59e0b',
    				high: '#ef4444',
    				critical: '#ff2d55'
    			},
    			background: 'var(--background)',
    			foreground: 'var(--foreground)',
    			card: {
    				DEFAULT: 'var(--card)',
    				foreground: 'var(--card-foreground)'
    			},
    			popover: {
    				DEFAULT: 'var(--popover)',
    				foreground: 'var(--popover-foreground)'
    			},
    			primary: {
    				DEFAULT: 'var(--primary)',
    				foreground: 'var(--primary-foreground)'
    			},
    			secondary: {
    				DEFAULT: 'var(--secondary)',
    				foreground: 'var(--secondary-foreground)'
    			},
    			muted: {
    				DEFAULT: 'var(--muted)',
    				foreground: 'var(--muted-foreground)'
    			},
    			accent: {
    				DEFAULT: 'var(--accent)',
    				foreground: 'var(--accent-foreground)'
    			},
    			destructive: {
    				DEFAULT: 'var(--destructive)',
    				foreground: 'var(--destructive-foreground)'
    			},
    			border: 'var(--border)',
    			input: 'var(--input)',
    			ring: 'var(--ring)',
    			chart: {
    				'1': 'var(--chart-1)',
    				'2': 'var(--chart-2)',
    				'3': 'var(--chart-3)',
    				'4': 'var(--chart-4)',
    				'5': 'var(--chart-5)'
    			}
    		},
    		animation: {
    			'pulse-slow': 'infraPulse 2.4s ease-in-out infinite',
    			'pulse-mid': 'infraPulse 1.2s ease-in-out infinite',
    			'pulse-fast': 'infraPulse 0.6s ease-in-out infinite'
    		},
    		keyframes: {
    			infraPulse: {
    				'0%, 100%': {
    					transform: 'scale(1)',
    					opacity: '1'
    				},
    				'50%': {
    					transform: 'scale(1.06)',
    					opacity: '0.85'
    				}
    			}
    		},
    		borderRadius: {
    			lg: 'var(--radius)',
    			md: 'calc(var(--radius) - 2px)',
    			sm: 'calc(var(--radius) - 4px)'
    		}
    	}
    },
    plugins: [require("tailwindcss-animate")],
};

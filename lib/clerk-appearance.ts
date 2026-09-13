export const clerkAppearance = {
  cssLayerName: 'clerk',
  variables: {
    colorPrimary: '#8B6CF5',
    colorBackground: '#16141E',
    colorForeground: '#F4F1FF',
    colorMutedForeground: '#A39BB8',
    colorInput: 'rgba(255,255,255,0.06)',
    colorInputForeground: '#F4F1FF',
    colorNeutral: '#F4F1FF',
    borderRadius: '0.9rem',
  },
  elements: {
    card: 'bg-[#16141E] border border-white/10 shadow-none',
    headerTitle: 'text-[#F4F1FF]',
    headerSubtitle: 'text-[#A39BB8]',
    socialButtonsBlockButton:
      'border border-white/10 bg-white/5 text-[#F4F1FF] hover:bg-white/10',
    formFieldInput: 'bg-white/5 border-white/10 text-[#F4F1FF]',
    footerActionLink: 'text-[#8B6CF5]',
    userButtonAvatarBox: 'h-8 w-8',
  },
} as const

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // O .env fica na raiz do monorepo, junto do da API.
  const ambiente = loadEnv(mode, '../..', '');
  return {
    plugins: [react()],
    server: {
      // A tela chama /api na mesma origem; o Vite repassa para a API, sem CORS.
      proxy: { '/api': `http://localhost:${ambiente.PORT || 3000}` },
    },
  };
});

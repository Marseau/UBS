# Background Music for Video Generation

## 📁 Como adicionar música de fundo

Coloque um arquivo MP3 nesta pasta com o nome `background.mp3` para usar como música de fundo nos vídeos gerados.

### Requisitos:
- **Formato:** MP3 ou WAV
- **Duração:** Mínimo 90 segundos (para cobrir vídeos do YouTube)
- **Volume:** A música será automaticamente reduzida para 15% do volume original
- **Licença:** Use apenas músicas royalty-free ou com licença comercial

### Sugestões de fontes de música royalty-free:
1. **YouTube Audio Library** - https://studio.youtube.com/channel/UC/music
2. **Pixabay Music** - https://pixabay.com/music/
3. **Free Music Archive** - https://freemusicarchive.org/
4. **Bensound** - https://www.bensound.com/

### Efeitos aplicados automaticamente:
- ✅ Fade in de 2 segundos no início
- ✅ Fade out de 2 segundos no final
- ✅ Volume reduzido a 15% (para não competir com narração)
- ✅ Mixado com a narração de IA

### Exemplo de uso:
```bash
# Baixar música e colocar aqui
cp ~/Downloads/background-music.mp3 ./background.mp3

# A música será automaticamente usada na próxima geração de vídeo
```

## 🎵 Música atual:
**Status:** ⚠️ Nenhuma música configurada ainda

Adicione `background.mp3` nesta pasta para ativar música de fundo nos vídeos.

import { Component, type ReactNode } from "react";

// Error boundary genérico. Aísla un crash de render: en vez de tumbar todo el
// árbol de React (pantalla negra / "This page couldn't load"), muestra
// `fallback` y deja el resto de la app viva.
//
// `resetKey`: cuando cambia, si el boundary estaba roto vuelve a intentar
// renderizar `children` (ej: llegó una respuesta nueva a un globo que crasheó).
//
// Contexto: un modelo de HuggingFace devolvió `<PAD>` × miles y el pipeline de
// markdown tiró `RangeError` → crasheaba TODO el canvas en cada carga. Ver
// decisiones F3-14.
export default class LimiteError extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey?: unknown },
  { rota: boolean }
> {
  state = { rota: false };

  static getDerivedStateFromError() {
    return { rota: true };
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.rota) {
      this.setState({ rota: false });
    }
  }

  render() {
    return this.state.rota ? this.props.fallback : this.props.children;
  }
}

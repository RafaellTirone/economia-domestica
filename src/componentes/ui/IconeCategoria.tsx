import {
  BookOpen, Briefcase, Car, Coins, Gift, HeartPulse, House, Landmark, Package, PawPrint, Shirt,
  ShoppingCart, Smile, Sparkles, SprayCan, Zap, type LucideIcon,
} from 'lucide-react';
import type { NomeIcone } from '../../tipos';

// Ícones que podem ser escolhidos para as categorias. Ficam embutidos no app (nada é baixado).
export const ICONES: Record<NomeIcone, LucideIcon> = {
  casa: House, carrinho: ShoppingCart, carro: Car, raio: Zap, banco: Landmark, saude: HeartPulse,
  livro: BookOpen, limpeza: SprayCan, lazer: Smile, camiseta: Shirt, caixa: Package, maleta: Briefcase,
  brilho: Sparkles, moedas: Coins, pet: PawPrint, presente: Gift,
};

export function IconeCategoria({ nome, tamanho = 20, className }: { nome: NomeIcone; tamanho?: number; className?: string }) {
  const Icone = ICONES[nome] ?? Package;
  return <Icone size={tamanho} strokeWidth={1.8} aria-hidden="true" className={className} />;
}

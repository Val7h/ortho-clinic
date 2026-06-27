/**
 * Layout isolado para /pre-consulta.
 *
 * Propósito: impedir que o shell do OrthoClinic (AuthProvider, NavigationProvider,
 * BottomTabBar, Sidebar) seja renderizado nesta rota. O formulário pré-consulta é
 * público e deve ser exibido como HTML puro, sem autenticação.
 *
 * Em next.js App Router com output:"export", layouts aninhados sobrepõem o root
 * layout apenas para as rotas filhas — exatamente o que precisamos aqui.
 */
export default function PreConsultaLayout({ children }: { children: React.ReactNode }) {
  return children;
}

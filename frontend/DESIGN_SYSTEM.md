# 🎨 OrthoClinic Design System Premium

## Visão Geral

Design system premium de altíssimo nível, baseado em iClinic mas com refinamentos exclusivos:

✅ **Cores refinadas** — Paleta completa de medical blue  
✅ **Tipografia elegante** — Sistema de escalas e pesos bem definidos  
✅ **Componentes reutilizáveis** — Button, Input, Card, Select, Badge, Modal  
✅ **Animações suaves** — Transições de 150ms, 200ms e 300ms  
✅ **Contraste WCAG AAA** — Acessibilidade premium  
✅ **Espaçamento consistente** — Escala de 2px a 12px  

---

## 📊 Paleta de Cores

### Primary — Brand Navy (Medical Authority)
```
brand-25:  #F9FBFD (background)
brand-50:  #EEF3FB (hover)
brand-100: #D5E2F5 (light)
brand-200: #AABFEA
brand-300: #7096D8
brand-400: #3D6BBF
brand-500: #1A4A9A
brand-600: #0F2D5E (main — buttons, headers)
brand-700: #0B2248 (hover/active)
brand-800: #071530 (dark)
brand-900: #030B1C (darkest)
```

### Accent — Medical Cyan (Clarity & Trust)
```
accent-50:  #F0FFFE
accent-100: #CFFAFE
accent-200: #A5F3FC
accent-300: #67E8F9
accent-400: #22D3EE
accent-500: #06B6D4 (main accent)
accent-600: #0891B2
accent-700: #0E7490
accent-800: #155E75
accent-900: #164E63
```

### Success, Warning, Error (Semantic)
- **Success**: green-600 (#16A34A) for positive outcomes
- **Warning**: amber-600 (#D97706) for cautions
- **Error**: red-600 (#DC2626) for critical issues

### Neutral — Cool Slate (Professional)
```
slate-25:  #FBFCFD
slate-50:  #F8FAFC
slate-100: #F1F5F9
slate-200: #E2E8F0
slate-300: #CBD5E1
slate-400: #94A3B8
slate-500: #64748B
slate-600: #475569 (secondary text)
slate-700: #334155 (body text)
slate-800: #1E293B (headings)
slate-900: #0F172A (dark headings)
```

---

## 🔤 Tipografia

### Font Stack
```
Sem serif: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif
```

### Escala de Tamanhos
| Size | Px | Line-height | Letter-spacing | Use Case |
|------|-------|-------------|----------------|----------|
| xs   | 12px  | 16px        | 0.3px          | Hints, labels |
| sm   | 13px  | 18px        | 0.2px          | Small labels |
| base | 14px  | 21px        | 0.15px         | Body text |
| lg   | 16px  | 24px        | 0.1px          | Medium text |
| xl   | 18px  | 28px        | 0px            | Large text |
| 2xl  | 20px  | 32px        | -0.3px         | Subheadings |
| 3xl  | 24px  | 36px        | -0.5px         | Headings |
| 4xl  | 32px  | 40px        | -0.8px         | Page titles |

### Font Weights
- 300 — Light (minimal use)
- 400 — Normal (body)
- 500 — Medium (labels, small headings)
- 600 — Semibold (sub-headings)
- 700 — Bold (headings)
- 800 — Extra bold (titles)
- 900 — Black (large titles only)

---

## 🧩 Componentes

### Button
```tsx
<Button variant="primary" size="md">
  Ação primária
</Button>
```

**Variantes**: `primary | secondary | tertiary | danger | success`  
**Tamanhos**: `sm | md | lg`  
**Props**: `isLoading`, `fullWidth`, `icon`, `iconPosition`

### Input
```tsx
<Input
  type="email"
  label="E-mail"
  placeholder="seu@email.com"
  icon={<Mail />}
  error="Email inválido"
/>
```

**Props**: `label`, `error`, `helper`, `icon`, `iconPosition`

### Card
```tsx
<Card hoverable shadow="md" padding="lg">
  <CardHeader>
    <CardTitle>Título</CardTitle>
    <CardDescription>Descrição</CardDescription>
  </CardHeader>
  <CardContent>Conteúdo</CardContent>
  <CardFooter>Rodapé</CardFooter>
</Card>
```

**Shadows**: `sm | md | lg | xl | none`  
**Paddings**: `sm | md | lg`  
**Props**: `hoverable`, `rounded`, `shadow`, `padding`

### Badge
```tsx
<Badge variant="brand" size="md" outline>
  Label
</Badge>
```

**Variantes**: `brand | accent | success | warning | error | neutral`  
**Tamanhos**: `sm | md | lg`

### Select
```tsx
<Select
  label="Opção"
  options={[{ value: 1, label: "Opção 1" }]}
  placeholder="Selecionar..."
/>
```

### Modal
```tsx
const { open, onOpenChange } = useModal();

<Modal
  open={open}
  onOpenChange={onOpenChange}
  title="Título"
  footer={<Button>Fechar</Button>}
>
  Conteúdo
</Modal>
```

---

## 🎬 Animações

### Transições
```
fast: 150ms cubic-bezier(0.4, 0, 0.2, 1)
base: 200ms cubic-bezier(0.4, 0, 0.2, 1)
slow: 300ms cubic-bezier(0.4, 0, 0.2, 1)
```

### Keyframes
- `fade-in` — Fade in 200ms
- `slide-in-up` — Slide from bottom + fade 300ms
- `pulse-subtle` — Gentle pulse 2s

---

## 🎯 Sombras (Premium)

```css
shadow-xs:   0 1px 2px rgba(15,45,94,0.04)
shadow-sm:   0 1px 3px rgba(15,45,94,0.08), 0 1px 2px rgba(15,45,94,0.06)
shadow-md:   0 2px 8px rgba(15,45,94,0.08), 0 1px 3px rgba(15,45,94,0.04)
shadow-lg:   0 10px 28px rgba(15,45,94,0.12), 0 10px 10px rgba(15,45,94,0.04)
shadow-xl:   0 20px 40px rgba(15,45,94,0.12), 0 10px 16px rgba(15,45,94,0.08)
```

---

## 📐 Espaçamento

Escala consistente de 2px a 12px (4px jumps):
- `p-1` = 2px
- `p-2` = 4px
- `p-3` = 6px
- `p-4` = 8px
- `p-5` = 10px
- `p-6` = 12px

---

## ✨ Padrões de Uso

### Estados de Interação

**Focus** — Ring 2px brand-500 com offset 2px
**Hover** — Eleva sombra, pode mudar cor
**Active** — Cor mais escura
**Disabled** — Opacity 60%, cursor not-allowed

### Contraste (WCAG AAA)

- **Texto em fundo**: Mínimo 7:1 para large text, 4.5:1 para normal
- **Ícones**: Mesmo que texto
- **Bordas**: Mínimo 3:1

### Layout

- **Padding cards**: 24px (md) a 32px (lg)
- **Gap entre items**: 12-16px (3-4px em Tailwind)
- **Max width main content**: 1280px (6xl)

---

## 🎪 Exemplo de Uso Completo

```tsx
'use client';
import { Button, Input, Card, CardContent, Badge } from '@/components/ui';

export default function Example() {
  return (
    <Card padding="lg" shadow="md">
      <CardContent className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Título</h2>
          <p className="mt-2 text-slate-600">Descrição</p>
        </div>

        <Input
          type="email"
          label="E-mail"
          placeholder="seu@email.com"
          required
        />

        <div className="flex gap-2">
          <Badge variant="brand">Novo</Badge>
          <Badge variant="success" outline>Ativo</Badge>
        </div>

        <Button fullWidth>
          Ação primária
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## 📱 Responsividade

Breakpoints Tailwind padrão:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

---

## 🔄 Próximas páginas para refatorar

1. ✅ Login page
2. ✅ Dashboard/Home
3. ⏳ Pacientes list
4. ⏳ Pacientes detail (prontuário)
5. ⏳ Agenda/Calendar
6. ⏳ Financeiro
7. ⏳ WhatsApp management

---

## 💡 Dicas de Implementação

1. **Sempre use componentes UI** — Garante consistência
2. **Respeite o espaçamento** — Nunca misture escalas
3. **Use variantes** — Não customizar inline
4. **Acessibilidade primeiro** — Labels, ARIA, contraste
5. **Teste responsividade** — Mobile first
6. **Animações suaves** — Máximo 300ms
7. **Teste em navegadores** — Chrome, Firefox, Safari

---

**Gerado em 2026-06-05 | OrthoClinic Premium Design v1.0**

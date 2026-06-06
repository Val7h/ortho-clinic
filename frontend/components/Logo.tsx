'use client';

export function Logo({ width = 40, height = 40 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-lg"
    >
      {/* Fundo com gradiente */}
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
      </defs>
      
      {/* Fundo arredondado */}
      <rect width="100" height="100" rx="20" fill="url(#grad1)" />
      
      {/* Vértebra 1 */}
      <circle cx="50" cy="20" r="5" fill="white" />
      
      {/* Conexão 1 */}
      <line x1="50" y1="25" x2="50" y2="30" stroke="white" strokeWidth="2" />
      
      {/* Vértebra 2 */}
      <circle cx="50" cy="36" r="6" fill="white" />
      
      {/* Conexão 2 */}
      <line x1="50" y1="42" x2="50" y2="48" stroke="white" strokeWidth="2" />
      
      {/* Vértebra Central (maior) */}
      <circle cx="50" cy="57" r="7" fill="white" />
      <circle cx="50" cy="57" r="3" fill="#0369a1" />
      
      {/* Conexão 3 */}
      <line x1="50" y1="64" x2="50" y2="70" stroke="white" strokeWidth="2" />
      
      {/* Vértebra 4 */}
      <circle cx="50" cy="78" r="6" fill="white" />
      
      {/* Conexão 4 */}
      <line x1="50" y1="84" x2="50" y2="89" stroke="white" strokeWidth="2" />
      
      {/* Vértebra 5 */}
      <circle cx="50" cy="95" r="5" fill="white" />
    </svg>
  );
}

export function LogoWithText({ width = 200 }: { width?: number }) {
  return (
    <div className="flex items-center gap-3">
      <Logo width={50} height={50} />
      <div className="leading-tight">
        <h1 className="text-lg font-bold text-white tracking-wide">OrthoClinic</h1>
        <p className="text-xs text-blue-100 font-medium">Premium Edition</p>
      </div>
    </div>
  );
}

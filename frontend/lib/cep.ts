// Busca de endereço pelo CEP (ViaCEP — gratuito, sem cadastro e sem chave,
// escolhido justamente por não criar manutenção recorrente).
//
// Só o CEP sai daqui: nenhum dado do paciente é enviado para fora.

export type EnderecoCep = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export const somenteDigitos = (v: string) => (v || "").replace(/\D/g, "");

export const formatarCep = (v: string) => {
  const d = somenteDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export const cepCompleto = (v: string) => somenteDigitos(v).length === 8;

/** Devolve o endereço do CEP, ou null se o CEP não existir / a busca falhar.
 *  Nunca lança: cadastro de paciente não pode travar por causa da internet. */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const d = somenteDigitos(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.erro) return null;
    return {
      logradouro: j.logradouro || "",
      bairro: j.bairro || "",
      cidade: j.localidade || "",
      uf: j.uf || "",
    };
  } catch {
    return null;
  }
}

/** Monta o endereço de uma linha (o banco guarda tudo em address_street). */
export function montarEndereco(
  logradouro: string,
  numero: string,
  complemento: string,
  bairro: string,
): string {
  const rua = [logradouro?.trim(), numero?.trim()].filter(Boolean).join(", ");
  return [rua, complemento?.trim(), bairro?.trim()].filter(Boolean).join(" - ");
}

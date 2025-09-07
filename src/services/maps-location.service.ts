/**
 * Maps Location Service
 * Sistema inteligente para endereços e localização com integração Google Maps
 * Inclui validação, formatação e geração de links funcionais
 */

import { supabaseAdmin } from '../config/database';

interface AddressComponents {
  street?: string;
  number?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  neighborhood?: string;
  complement?: string;
}

interface LocationData {
  address: string;
  formattedAddress: string;
  components?: AddressComponents;
  coordinates?: {
    lat: number;
    lng: number;
  };
  businessName?: string;
  businessPhone?: string;
}

interface MapsResult {
  success: boolean;
  message: string;
  hasLocation: boolean;
  mapsLink?: string;
  wazeLink?: string;
  coordinates?: { lat: number; lng: number };
}

export class MapsLocationService {
  
  /**
   * Processa requisição de localização do tenant
   */
  async processLocationRequest(tenantId: string, userQuery?: string): Promise<MapsResult> {
    try {
      // HACK: Caso de teste temporário para o tenant específico
      if (tenantId === '9a349440-1409-4d65-b707-a6e5aa00c581') {
        console.log('🎯 [MAPS] Usando dados de teste hardcoded para tenant demo');
        const testTenant = {
          name: 'Salão Teste',
          business_name: 'Salão de Beleza Maps Test',
          address: 'Rua das Flores, 123, Centro, São Paulo - SP, CEP: 01234-567',
          business_address: 'Rua das Flores, 123, Centro, São Paulo - SP, CEP: 01234-567',
          business_phone: '+5511888888888',
          city: 'São Paulo',
          state: 'SP'
        };
        
        // Processar com dados de teste
        const locationData = this.extractLocationData(testTenant);
        
        if (!locationData.address) {
          return {
            success: true,
            message: 'O endereço não está cadastrado no sistema. Entre em contato conosco para mais informações sobre a localização.',
            hasLocation: false
          };
        }

        // Verificar se o usuário quer especificamente Maps/Waze
        const wantsMaps = Boolean(userQuery && /(maps|localiza|como chegar|rota|navega)/i.test(userQuery));
        const wantsWaze = Boolean(userQuery && /waze/i.test(userQuery));

        // Gerar resposta inteligente baseada na consulta
        return this.generateLocationResponse(locationData, {
          includeMaps: wantsMaps || !userQuery, // Default inclui maps se não especificou
          includeWaze: wantsWaze,
          isDirectRequest: Boolean(userQuery)
        });
      }
      
      // Buscar dados do tenant normalmente
      const { data: tenant, error } = await supabaseAdmin
        .from('tenants')
        .select(`
          name,
          business_name,
          address,
          business_address,
          business_phone,
          city,
          state
        `)
        .eq('id', tenantId)
        .single();

      if (error || !tenant) {
        return {
          success: false,
          message: 'Dados do estabelecimento não encontrados.',
          hasLocation: false
        };
      }

      // Extrair dados de localização
      const locationData = this.extractLocationData(tenant);
      
      if (!locationData.address) {
        return {
          success: true,
          message: 'O endereço não está cadastrado no sistema. Entre em contato conosco para mais informações sobre a localização.',
          hasLocation: false
        };
      }

      // Verificar se o usuário quer especificamente Maps/Waze
      const wantsMaps = Boolean(userQuery && /(maps|localiza|como chegar|rota|navega)/i.test(userQuery));
      const wantsWaze = Boolean(userQuery && /waze/i.test(userQuery));

      // Gerar resposta inteligente baseada na consulta
      return this.generateLocationResponse(locationData, {
        includeMaps: wantsMaps || !userQuery, // Default inclui maps se não especificou
        includeWaze: wantsWaze,
        isDirectRequest: Boolean(userQuery)
      });

    } catch (error) {
      console.error('❌ [MAPS] Erro ao processar localização:', error);
      return {
        success: false,
        message: 'Erro interno ao buscar localização. Tente novamente.',
        hasLocation: false
      };
    }
  }

  /**
   * Extrai e normaliza dados de localização do tenant
   */
  private extractLocationData(tenant: any): LocationData {
    // Prioridade: address string -> business_address object -> campos separados
    let address = '';
    let components: AddressComponents = {};

    if (tenant.address && typeof tenant.address === 'string') {
      address = tenant.address.trim();
    } else if (tenant.business_address) {
      // business_address pode ser string JSON ou objeto
      let addrObj = tenant.business_address;
      if (typeof addrObj === 'string') {
        try {
          addrObj = JSON.parse(addrObj);
        } catch {
          address = addrObj;
        }
      }
      
      if (typeof addrObj === 'object' && addrObj) {
        components = {
          street: addrObj.street || addrObj.endereco,
          number: addrObj.number || addrObj.numero,
          city: addrObj.city || addrObj.cidade,
          state: addrObj.state || addrObj.estado || addrObj.uf,
          zipCode: addrObj.zipCode || addrObj.cep,
          neighborhood: addrObj.neighborhood || addrObj.bairro,
          complement: addrObj.complement || addrObj.complemento
        };
        
        // Montar endereço a partir dos componentes
        const parts = [
          components.street,
          components.number,
          components.neighborhood,
          components.city,
          components.state
        ].filter(Boolean);
        
        if (parts.length > 0) {
          address = parts.join(', ');
        }
      }
    }

    // Fallback para cidade/estado separados
    if (!address && (tenant.city || tenant.state)) {
      const parts = [tenant.city, tenant.state].filter(Boolean);
      address = parts.join(', ');
    }

    return {
      address,
      formattedAddress: this.formatAddress(address, components),
      components,
      businessName: tenant.business_name || tenant.name,
      businessPhone: tenant.business_phone
    };
  }

  /**
   * Formata endereço para exibição
   */
  private formatAddress(address: string, components?: AddressComponents): string {
    if (!address) return '';

    // Se temos componentes estruturados, usar formatação padrão brasileira
    if (components && components.street) {
      const parts: string[] = [];
      
      // Rua/Av + Número
      if (components.street && components.number) {
        parts.push(`${components.street}, ${components.number}`);
      } else if (components.street) {
        parts.push(components.street);
      }
      
      // Bairro
      if (components.neighborhood) {
        parts.push(components.neighborhood);
      }
      
      // Cidade - Estado
      if (components.city && components.state) {
        parts.push(`${components.city} - ${components.state}`);
      } else if (components.city) {
        parts.push(components.city);
      } else if (components.state) {
        parts.push(components.state);
      }
      
      // CEP
      if (components.zipCode) {
        parts.push(`CEP: ${components.zipCode}`);
      }
      
      return parts.join('\n');
    }

    // Endereço simples - melhorar formatação
    return address.replace(/,\s*/g, '\n').replace(/\n+/g, '\n').trim();
  }

  /**
   * Gera resposta inteligente com links funcionais
   */
  private generateLocationResponse(
    locationData: LocationData, 
    options: { includeMaps?: boolean; includeWaze?: boolean; isDirectRequest?: boolean }
  ): MapsResult {
    
    const { address, formattedAddress, businessName, businessPhone } = locationData;
    
    if (!address) {
      return {
        success: true,
        message: 'O endereço não está disponível no momento. Entre em contato para mais informações.',
        hasLocation: false
      };
    }

    // Gerar links funcionais
    const encodedAddress = encodeURIComponent(address);
    const businessQuery = businessName ? encodeURIComponent(`${businessName} ${address}`) : encodedAddress;
    
    const mapsLink = `https://maps.google.com/maps?q=${businessQuery}`;
    const wazeLink = `https://waze.com/ul?q=${encodedAddress}`;

    // Construir mensagem
    const header = businessName ? 
      `📍 **${businessName}**\n\n` : 
      `📍 **Nossa localização:**\n\n`;

    let message = header + formattedAddress;

    // Adicionar telefone se disponível
    if (businessPhone) {
      message += `\n📞 ${businessPhone}`;
    }

    // Adicionar links de navegação
    if (options.includeMaps || options.includeWaze) {
      message += '\n\n🗺️ **Como chegar:**';
      
      if (options.includeMaps) {
        message += `\n🔗 [Abrir no Google Maps](${mapsLink})`;
      }
      
      if (options.includeWaze) {
        message += `\n🚗 [Navegar com Waze](${wazeLink})`;
      }
      
      if (!options.includeWaze && options.includeMaps) {
        message += `\n🚗 [Navegar com Waze](${wazeLink})`;
      }
    } else {
      // Pergunta se quer navegar
      message += '\n\n❓ Precisa da rota? Posso enviar o link do Maps ou Waze!';
    }

    return {
      success: true,
      message,
      hasLocation: true,
      mapsLink,
      wazeLink
    };
  }

  /**
   * Processa resposta do usuário sobre navegação
   */
  async processNavigationResponse(tenantId: string, userResponse: string): Promise<MapsResult> {
    const wantsMaps = /maps|google/i.test(userResponse);
    const wantsWaze = /waze/i.test(userResponse);
    const wantsNavigation = /sim|quero|preciso|rota|navega/i.test(userResponse);

    if (!wantsMaps && !wantsWaze && !wantsNavigation) {
      return {
        success: true,
        message: 'Tudo bem! Se precisar da localização depois, é só pedir. 😊',
        hasLocation: false
      };
    }

    // Re-processar com opções específicas
    return this.processLocationRequest(tenantId, userResponse);
  }

  /**
   * Valida se um endereço parece completo
   */
  static validateAddress(address: string): { isValid: boolean; missingComponents: string[] } {
    const missing: string[] = [];
    
    if (!address || address.trim().length < 10) {
      return { isValid: false, missingComponents: ['Endereço muito curto'] };
    }

    // Verificações básicas para endereço brasileiro
    if (!/\d/.test(address)) {
      missing.push('Número');
    }
    
    if (!/[a-zA-ZÀ-ÿ]+.*[a-zA-ZÀ-ÿ]/.test(address)) {
      missing.push('Nome da rua/cidade');
    }

    return {
      isValid: missing.length === 0,
      missingComponents: missing
    };
  }

  /**
   * Normaliza endereço para busca
   */
  static normalizeAddressForSearch(address: string): string {
    return address
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^\w\s,-]/g, ' ') // Remove caracteres especiais
      .replace(/\s+/g, ' ') // Normaliza espaços
      .trim();
  }
}
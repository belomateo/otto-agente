export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accesorios_alquiler: {
        Row: {
          activo: boolean
          editado_at: string
          editado_por: string | null
          id: string
          nombre: string
          precio: number
          precio_compra: number | null
          version: number
        }
        Insert: {
          activo?: boolean
          editado_at?: string
          editado_por?: string | null
          id?: string
          nombre: string
          precio: number
          precio_compra?: number | null
          version?: number
        }
        Update: {
          activo?: boolean
          editado_at?: string
          editado_por?: string | null
          id?: string
          nombre?: string
          precio?: number
          precio_compra?: number | null
          version?: number
        }
        Relationships: []
      }
      analisis_charlas: {
        Row: {
          autor_cita: string | null
          categoria: string
          cita: string | null
          conversacion_id: string
          creado_at: string
          estado: string
          fecha: string
          gravedad: string | null
          id: string
          marcado_at: string | null
          marcado_por: string | null
          mensaje_id: string | null
          modelo: string | null
          que_conviene: string | null
          que_paso: string
          tema: string | null
          texto_sugerido: string | null
          tipo: string
        }
        Insert: {
          autor_cita?: string | null
          categoria: string
          cita?: string | null
          conversacion_id: string
          creado_at?: string
          estado?: string
          fecha: string
          gravedad?: string | null
          id?: string
          marcado_at?: string | null
          marcado_por?: string | null
          mensaje_id?: string | null
          modelo?: string | null
          que_conviene?: string | null
          que_paso: string
          tema?: string | null
          texto_sugerido?: string | null
          tipo: string
        }
        Update: {
          autor_cita?: string | null
          categoria?: string
          cita?: string | null
          conversacion_id?: string
          creado_at?: string
          estado?: string
          fecha?: string
          gravedad?: string | null
          id?: string
          marcado_at?: string | null
          marcado_por?: string | null
          mensaje_id?: string | null
          modelo?: string | null
          que_conviene?: string | null
          que_paso?: string
          tema?: string | null
          texto_sugerido?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "analisis_charlas_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analisis_charlas_marcado_por_fkey"
            columns: ["marcado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analisis_charlas_mensaje_id_fkey"
            columns: ["mensaje_id"]
            isOneToOne: false
            referencedRelation: "mensajes"
            referencedColumns: ["id"]
          },
        ]
      }
      analisis_revisiones: {
        Row: {
          conversacion_id: string
          costo_usd: number
          detalle: string | null
          estado: string
          fecha: string
          hallazgos: number
          intentos: number
          modelo: string | null
          terminada_at: string | null
          tokens_in: number
          tokens_out: number
          tomada_at: string
        }
        Insert: {
          conversacion_id: string
          costo_usd?: number
          detalle?: string | null
          estado: string
          fecha: string
          hallazgos?: number
          intentos?: number
          modelo?: string | null
          terminada_at?: string | null
          tokens_in?: number
          tokens_out?: number
          tomada_at?: string
        }
        Update: {
          conversacion_id?: string
          costo_usd?: number
          detalle?: string | null
          estado?: string
          fecha?: string
          hallazgos?: number
          intentos?: number
          modelo?: string | null
          terminada_at?: string | null
          tokens_in?: number
          tokens_out?: number
          tomada_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analisis_revisiones_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      bloqueos_agenda: {
        Row: {
          creado_at: string
          creado_por: string | null
          creado_por_admin: boolean
          desde: string
          editado_at: string
          editado_por: string | null
          fecha: string
          hasta: string
          id: string
          motivo: string | null
          probador: number | null
          version: number
        }
        Insert: {
          creado_at?: string
          creado_por?: string | null
          creado_por_admin?: boolean
          desde: string
          editado_at?: string
          editado_por?: string | null
          fecha: string
          hasta: string
          id?: string
          motivo?: string | null
          probador?: number | null
          version?: number
        }
        Update: {
          creado_at?: string
          creado_por?: string | null
          creado_por_admin?: boolean
          desde?: string
          editado_at?: string
          editado_por?: string | null
          fecha?: string
          hasta?: string
          id?: string
          motivo?: string | null
          probador?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bloqueos_agenda_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_alquiler: {
        Row: {
          activo: boolean
          colores: Json
          descripcion: string | null
          editado_at: string
          editado_por: string | null
          fotos: string[]
          id: string
          modelo: string
          orden: number
          precio_base: number
          talles: string[]
          version: number
        }
        Insert: {
          activo?: boolean
          colores?: Json
          descripcion?: string | null
          editado_at?: string
          editado_por?: string | null
          fotos?: string[]
          id?: string
          modelo: string
          orden: number
          precio_base: number
          talles?: string[]
          version?: number
        }
        Update: {
          activo?: boolean
          colores?: Json
          descripcion?: string | null
          editado_at?: string
          editado_por?: string | null
          fotos?: string[]
          id?: string
          modelo?: string
          orden?: number
          precio_base?: number
          talles?: string[]
          version?: number
        }
        Relationships: []
      }
      cierres_agenda: {
        Row: {
          creado_at: string
          creado_por: string | null
          fecha: string
          motivo: string | null
        }
        Insert: {
          creado_at?: string
          creado_por?: string | null
          fecha: string
          motivo?: string | null
        }
        Update: {
          creado_at?: string
          creado_por?: string | null
          fecha?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cierres_agenda_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          actualizado_at: string
          busqueda: string | null
          ciudad: string | null
          color_preferido: string | null
          creado_at: string
          dia_o_noche: string | null
          editado_at: string
          editado_por: string | null
          email: string | null
          evento: string | null
          fecha_evento: string | null
          id: string
          nombre: string | null
          notas_libres: string | null
          presupuesto_mencionado: string | null
          rol: string | null
          talle_aprox: string | null
          telefono: string
          version: number
        }
        Insert: {
          actualizado_at?: string
          busqueda?: string | null
          ciudad?: string | null
          color_preferido?: string | null
          creado_at?: string
          dia_o_noche?: string | null
          editado_at?: string
          editado_por?: string | null
          email?: string | null
          evento?: string | null
          fecha_evento?: string | null
          id?: string
          nombre?: string | null
          notas_libres?: string | null
          presupuesto_mencionado?: string | null
          rol?: string | null
          talle_aprox?: string | null
          telefono: string
          version?: number
        }
        Update: {
          actualizado_at?: string
          busqueda?: string | null
          ciudad?: string | null
          color_preferido?: string | null
          creado_at?: string
          dia_o_noche?: string | null
          editado_at?: string
          editado_por?: string | null
          email?: string | null
          evento?: string | null
          fecha_evento?: string | null
          id?: string
          nombre?: string | null
          notas_libres?: string | null
          presupuesto_mencionado?: string | null
          rol?: string | null
          talle_aprox?: string | null
          telefono?: string
          version?: number
        }
        Relationships: []
      }
      cola_trabajos: {
        Row: {
          conversacion_id: string
          creado_at: string
          estado: string
          id: string
          intentos: number
          payload: Json
          procesado_at: string | null
          reintentar_despues_de: string | null
          respondido_at: string | null
          tomado_at: string | null
          tomado_por: string | null
        }
        Insert: {
          conversacion_id: string
          creado_at?: string
          estado?: string
          id?: string
          intentos?: number
          payload?: Json
          procesado_at?: string | null
          reintentar_despues_de?: string | null
          respondido_at?: string | null
          tomado_at?: string | null
          tomado_por?: string | null
        }
        Update: {
          conversacion_id?: string
          creado_at?: string
          estado?: string
          id?: string
          intentos?: number
          payload?: Json
          procesado_at?: string | null
          reintentar_despues_de?: string | null
          respondido_at?: string | null
          tomado_at?: string | null
          tomado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cola_trabajos_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_agenda: {
        Row: {
          aviso_turno_min: number | null
          cantidad_probadores: number
          dias_reserva_urgencia: number | null
          dias_simultaneos: number[]
          editado_at: string
          editado_por: string | null
          escalonado_min: number
          id: string
          probadores_lucia: number | null
          unica: boolean
          version: number
        }
        Insert: {
          aviso_turno_min?: number | null
          cantidad_probadores: number
          dias_reserva_urgencia?: number | null
          dias_simultaneos?: number[]
          editado_at?: string
          editado_por?: string | null
          escalonado_min: number
          id?: string
          probadores_lucia?: number | null
          unica?: boolean
          version?: number
        }
        Update: {
          aviso_turno_min?: number | null
          cantidad_probadores?: number
          dias_reserva_urgencia?: number | null
          dias_simultaneos?: number[]
          editado_at?: string
          editado_por?: string | null
          escalonado_min?: number
          id?: string
          probadores_lucia?: number | null
          unica?: boolean
          version?: number
        }
        Relationships: []
      }
      consumo_llm: {
        Row: {
          conversacion_id: string | null
          costo_usd: number
          creado_at: string
          id: string
          modelo: string
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          conversacion_id?: string | null
          costo_usd?: number
          creado_at?: string
          id?: string
          modelo: string
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          conversacion_id?: string | null
          costo_usd?: number
          creado_at?: string
          id?: string
          modelo?: string
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "consumo_llm_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      contexto_agente: {
        Row: {
          clave: string
          editado_at: string
          editado_por: string | null
          id: string
          valor: string
          version: number
        }
        Insert: {
          clave: string
          editado_at?: string
          editado_por?: string | null
          id?: string
          valor: string
          version?: number
        }
        Update: {
          clave?: string
          editado_at?: string
          editado_por?: string | null
          id?: string
          valor?: string
          version?: number
        }
        Relationships: []
      }
      conversaciones: {
        Row: {
          canal: string
          cliente_id: string
          estado: string
          etiquetas: string[]
          id: string
          iniciado_at: string
          lucia_activa: boolean
          ultimo_mensaje_at: string | null
        }
        Insert: {
          canal?: string
          cliente_id: string
          estado?: string
          etiquetas?: string[]
          id?: string
          iniciado_at?: string
          lucia_activa?: boolean
          ultimo_mensaje_at?: string | null
        }
        Update: {
          canal?: string
          cliente_id?: string
          estado?: string
          etiquetas?: string[]
          id?: string
          iniciado_at?: string
          lucia_activa?: boolean
          ultimo_mensaje_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      correcciones_lucia: {
        Row: {
          actualizada_at: string
          analisis: Json
          base: Json
          cambio: Json | null
          costo_usd: number
          creada_at: string
          destino: string | null
          estado: string
          id: string
          modelo: string | null
          opcion: string | null
          pedida_por: string | null
          pedida_por_id: string | null
          pedido: string
          pruebas_ok: number
          pruebas_total: number
          resultado: string | null
          terminada_at: string | null
        }
        Insert: {
          actualizada_at?: string
          analisis: Json
          base?: Json
          cambio?: Json | null
          costo_usd?: number
          creada_at?: string
          destino?: string | null
          estado?: string
          id?: string
          modelo?: string | null
          opcion?: string | null
          pedida_por?: string | null
          pedida_por_id?: string | null
          pedido: string
          pruebas_ok?: number
          pruebas_total?: number
          resultado?: string | null
          terminada_at?: string | null
        }
        Update: {
          actualizada_at?: string
          analisis?: Json
          base?: Json
          cambio?: Json | null
          costo_usd?: number
          creada_at?: string
          destino?: string | null
          estado?: string
          id?: string
          modelo?: string | null
          opcion?: string | null
          pedida_por?: string | null
          pedida_por_id?: string | null
          pedido?: string
          pruebas_ok?: number
          pruebas_total?: number
          resultado?: string | null
          terminada_at?: string | null
        }
        Relationships: []
      }
      correcciones_pruebas: {
        Row: {
          charla: Json | null
          correccion_id: string
          costo_usd: number
          debe: Json
          estado: string
          ficha: Json | null
          id: string
          intentos: number
          mensajes: Json
          motivo: string | null
          no_debe: Json
          nombre: string
          orden: number
          terminada_at: string | null
          tomada_at: string | null
          veredicto: Json | null
        }
        Insert: {
          charla?: Json | null
          correccion_id: string
          costo_usd?: number
          debe: Json
          estado?: string
          ficha?: Json | null
          id?: string
          intentos?: number
          mensajes: Json
          motivo?: string | null
          no_debe?: Json
          nombre: string
          orden: number
          terminada_at?: string | null
          tomada_at?: string | null
          veredicto?: Json | null
        }
        Update: {
          charla?: Json | null
          correccion_id?: string
          costo_usd?: number
          debe?: Json
          estado?: string
          ficha?: Json | null
          id?: string
          intentos?: number
          mensajes?: Json
          motivo?: string | null
          no_debe?: Json
          nombre?: string
          orden?: number
          terminada_at?: string | null
          tomada_at?: string | null
          veredicto?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "correcciones_pruebas_correccion_id_fkey"
            columns: ["correccion_id"]
            isOneToOne: false
            referencedRelation: "correcciones_lucia"
            referencedColumns: ["id"]
          },
        ]
      }
      derivaciones: {
        Row: {
          atendida_at: string | null
          atendida_por: string | null
          conversacion_id: string
          creado_at: string
          destino_tel: string | null
          estado: string
          id: string
          motivo: string
        }
        Insert: {
          atendida_at?: string | null
          atendida_por?: string | null
          conversacion_id: string
          creado_at?: string
          destino_tel?: string | null
          estado?: string
          id?: string
          motivo: string
        }
        Update: {
          atendida_at?: string | null
          atendida_por?: string | null
          conversacion_id?: string
          creado_at?: string
          destino_tel?: string | null
          estado?: string
          id?: string
          motivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "derivaciones_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      duraciones_turno: {
        Row: {
          duracion_min: number
          editado_at: string
          editado_por: string | null
          id: string
          tipo: string
          version: number
        }
        Insert: {
          duracion_min: number
          editado_at?: string
          editado_por?: string | null
          id?: string
          tipo: string
          version?: number
        }
        Update: {
          duracion_min?: number
          editado_at?: string
          editado_por?: string | null
          id?: string
          tipo?: string
          version?: number
        }
        Relationships: []
      }
      enlaces: {
        Row: {
          activo: boolean
          editado_at: string
          editado_por: string | null
          id: string
          nombre: string
          url: string
          version: number
        }
        Insert: {
          activo?: boolean
          editado_at?: string
          editado_por?: string | null
          id?: string
          nombre: string
          url: string
          version?: number
        }
        Update: {
          activo?: boolean
          editado_at?: string
          editado_por?: string | null
          id?: string
          nombre?: string
          url?: string
          version?: number
        }
        Relationships: []
      }
      respuestas_rapidas: {
        Row: {
          activo: boolean
          atajo: string
          creado_at: string
          editado_at: string
          editado_por: string | null
          id: string
          orden: number
          texto: string
          version: number
        }
        Insert: {
          activo?: boolean
          atajo: string
          creado_at?: string
          editado_at?: string
          editado_por?: string | null
          id?: string
          orden?: number
          texto: string
          version?: number
        }
        Update: {
          activo?: boolean
          atajo?: string
          creado_at?: string
          editado_at?: string
          editado_por?: string | null
          id?: string
          orden?: number
          texto?: string
          version?: number
        }
        Relationships: []
      }
      envios_programados: {
        Row: {
          actualizado_at: string
          cliente_id: string
          creado_at: string
          enviado_at: string | null
          error: string | null
          estado: string
          id: string
          intentos: number
          plantilla: string
          referencia: string
          tipo: string
          wa_message_id: string | null
        }
        Insert: {
          actualizado_at?: string
          cliente_id: string
          creado_at?: string
          enviado_at?: string | null
          error?: string | null
          estado?: string
          id?: string
          intentos?: number
          plantilla: string
          referencia: string
          tipo: string
          wa_message_id?: string | null
        }
        Update: {
          actualizado_at?: string
          cliente_id?: string
          creado_at?: string
          enviado_at?: string | null
          error?: string | null
          estado?: string
          id?: string
          intentos?: number
          plantilla?: string
          referencia?: string
          tipo?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envios_programados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_agente: {
        Row: {
          conversacion_id: string
          creado_at: string
          detalle: Json
          id: string
          tipo: string
        }
        Insert: {
          conversacion_id: string
          creado_at?: string
          detalle?: Json
          id?: string
          tipo: string
        }
        Update: {
          conversacion_id?: string
          creado_at?: string
          detalle?: Json
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_agente_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados_posibles: {
        Row: {
          decidido_at: string | null
          decidido_por: string | null
          fecha: string
          local_abierto: boolean | null
          nombre: string
        }
        Insert: {
          decidido_at?: string | null
          decidido_por?: string | null
          fecha: string
          local_abierto?: boolean | null
          nombre: string
        }
        Update: {
          decidido_at?: string | null
          decidido_por?: string | null
          fecha?: string
          local_abierto?: boolean | null
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "feriados_posibles_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fragmentos: {
        Row: {
          activo: boolean
          busqueda: unknown
          editado_at: string
          editado_por: string | null
          id: string
          tema: string
          texto: string
          titulo: string
          version: number
        }
        Insert: {
          activo?: boolean
          busqueda?: unknown
          editado_at?: string
          editado_por?: string | null
          id?: string
          tema: string
          texto: string
          titulo: string
          version?: number
        }
        Update: {
          activo?: boolean
          busqueda?: unknown
          editado_at?: string
          editado_por?: string | null
          id?: string
          tema?: string
          texto?: string
          titulo?: string
          version?: number
        }
        Relationships: []
      }
      franjas_turnos: {
        Row: {
          desde: string
          dia_semana: number
          editado_at: string
          editado_por: string | null
          hasta: string
          id: string
          probadores: number
          version: number
        }
        Insert: {
          desde: string
          dia_semana: number
          editado_at?: string
          editado_por?: string | null
          hasta: string
          id?: string
          probadores: number
          version?: number
        }
        Update: {
          desde?: string
          dia_semana?: number
          editado_at?: string
          editado_por?: string | null
          hasta?: string
          id?: string
          probadores?: number
          version?: number
        }
        Relationships: []
      }
      herramientas_agente: {
        Row: {
          activa: boolean
          descripcion: string
          editado_at: string
          editado_por: string | null
          id: string
          nombre: string
          orden: number
          tipo: string
          version: number
        }
        Insert: {
          activa?: boolean
          descripcion: string
          editado_at?: string
          editado_por?: string | null
          id?: string
          nombre: string
          orden?: number
          tipo: string
          version?: number
        }
        Update: {
          activa?: boolean
          descripcion?: string
          editado_at?: string
          editado_por?: string | null
          id?: string
          nombre?: string
          orden?: number
          tipo?: string
          version?: number
        }
        Relationships: []
      }
      historial_ediciones: {
        Row: {
          datos_anteriores: Json
          editado_at: string
          editado_por: string | null
          fila_id: string
          id: string
          tabla: string
          version: number
        }
        Insert: {
          datos_anteriores: Json
          editado_at?: string
          editado_por?: string | null
          fila_id: string
          id?: string
          tabla: string
          version: number
        }
        Update: {
          datos_anteriores?: Json
          editado_at?: string
          editado_por?: string | null
          fila_id?: string
          id?: string
          tabla?: string
          version?: number
        }
        Relationships: []
      }
      horarios: {
        Row: {
          activo: boolean
          corte_desde: string | null
          corte_hasta: string | null
          dia_semana: number
          editado_at: string
          editado_por: string | null
          hora_apertura: string
          hora_cierre: string
          id: string
          version: number
        }
        Insert: {
          activo?: boolean
          corte_desde?: string | null
          corte_hasta?: string | null
          dia_semana: number
          editado_at?: string
          editado_por?: string | null
          hora_apertura: string
          hora_cierre: string
          id?: string
          version?: number
        }
        Update: {
          activo?: boolean
          corte_desde?: string | null
          corte_hasta?: string | null
          dia_semana?: number
          editado_at?: string
          editado_por?: string | null
          hora_apertura?: string
          hora_cierre?: string
          id?: string
          version?: number
        }
        Relationships: []
      }
      instrucciones_lucia: {
        Row: {
          activada_at: string | null
          base_origen: string
          base_version: number | null
          correccion_id: string | null
          creada_at: string
          creada_por: string | null
          desactivada_at: string | null
          desactivada_por: string | null
          estado: string
          hash_archivo: string | null
          id: string
          motivo_desactivacion: string | null
          pedido: string | null
          prueba: Json | null
          prueba_ok: boolean
          restaurada_de: number | null
          resumen: string
          texto: string
          version: number
        }
        Insert: {
          activada_at?: string | null
          base_origen: string
          base_version?: number | null
          correccion_id?: string | null
          creada_at?: string
          creada_por?: string | null
          desactivada_at?: string | null
          desactivada_por?: string | null
          estado?: string
          hash_archivo?: string | null
          id?: string
          motivo_desactivacion?: string | null
          pedido?: string | null
          prueba?: Json | null
          prueba_ok?: boolean
          restaurada_de?: number | null
          resumen: string
          texto: string
          version: number
        }
        Update: {
          activada_at?: string | null
          base_origen?: string
          base_version?: number | null
          correccion_id?: string | null
          creada_at?: string
          creada_por?: string | null
          desactivada_at?: string | null
          desactivada_por?: string | null
          estado?: string
          hash_archivo?: string | null
          id?: string
          motivo_desactivacion?: string | null
          pedido?: string | null
          prueba?: Json | null
          prueba_ok?: boolean
          restaurada_de?: number | null
          resumen?: string
          texto?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "instrucciones_lucia_correccion_id_fkey"
            columns: ["correccion_id"]
            isOneToOne: false
            referencedRelation: "correcciones_lucia"
            referencedColumns: ["id"]
          },
        ]
      }
      invitaciones_acceso: {
        Row: {
          creado_at: string
          email: string
          invitado_por: string | null
          rol: string
          usado_at: string | null
        }
        Insert: {
          creado_at?: string
          email: string
          invitado_por?: string | null
          rol: string
          usado_at?: string | null
        }
        Update: {
          creado_at?: string
          email?: string
          invitado_por?: string | null
          rol?: string
          usado_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitaciones_acceso_invitado_por_fkey"
            columns: ["invitado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes: {
        Row: {
          adjunto_bytes: number | null
          adjunto_detalle: string | null
          adjunto_estado: string | null
          adjunto_media_id: string | null
          adjunto_mime: string | null
          adjunto_path: string | null
          adjunto_segundos: number | null
          adjunto_voz: boolean | null
          contenido: string | null
          conversacion_id: string
          direccion: string
          enviado_at: string
          enviando_at: string | null
          id: string
          leido_equipo_at: string | null
          no_enviado_motivo: string | null
          tipo: string
          transcripcion: string | null
          wa_message_id: string | null
        }
        Insert: {
          adjunto_bytes?: number | null
          adjunto_detalle?: string | null
          adjunto_estado?: string | null
          adjunto_media_id?: string | null
          adjunto_mime?: string | null
          adjunto_path?: string | null
          adjunto_segundos?: number | null
          adjunto_voz?: boolean | null
          contenido?: string | null
          conversacion_id: string
          direccion: string
          enviado_at?: string
          enviando_at?: string | null
          id?: string
          leido_equipo_at?: string | null
          no_enviado_motivo?: string | null
          tipo?: string
          transcripcion?: string | null
          wa_message_id?: string | null
        }
        Update: {
          adjunto_bytes?: number | null
          adjunto_detalle?: string | null
          adjunto_estado?: string | null
          adjunto_media_id?: string | null
          adjunto_mime?: string | null
          adjunto_path?: string | null
          adjunto_segundos?: number | null
          adjunto_voz?: boolean | null
          contenido?: string | null
          conversacion_id?: string
          direccion?: string
          enviado_at?: string
          enviando_at?: string | null
          id?: string
          leido_equipo_at?: string | null
          no_enviado_motivo?: string | null
          tipo?: string
          transcripcion?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      metricas_diarias: {
        Row: {
          conversaciones_nuevas: number
          costo_llm_usd: number
          creado_at: string
          derivaciones: number
          fecha: string
          id: string
          turnos_agendados: number
        }
        Insert: {
          conversaciones_nuevas?: number
          costo_llm_usd?: number
          creado_at?: string
          derivaciones?: number
          fecha: string
          id?: string
          turnos_agendados?: number
        }
        Update: {
          conversaciones_nuevas?: number
          costo_llm_usd?: number
          creado_at?: string
          derivaciones?: number
          fecha?: string
          id?: string
          turnos_agendados?: number
        }
        Relationships: []
      }
      notas: {
        Row: {
          autor: string
          cliente_id: string
          creado_at: string
          id: string
          texto: string
          turno_id: string | null
        }
        Insert: {
          autor: string
          cliente_id: string
          creado_at?: string
          id?: string
          texto: string
          turno_id?: string | null
        }
        Update: {
          autor?: string
          cliente_id?: string
          creado_at?: string
          id?: string
          texto?: string
          turno_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_por_avisar"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_dueno: {
        Row: {
          activo: boolean
          creado_at: string
          creado_por: string | null
          editado_at: string
          editado_por: string | null
          id: string
          texto: string
          titulo: string | null
          version: number
        }
        Insert: {
          activo?: boolean
          creado_at?: string
          creado_por?: string | null
          editado_at?: string
          editado_por?: string | null
          id?: string
          texto: string
          titulo?: string | null
          version?: number
        }
        Update: {
          activo?: boolean
          creado_at?: string
          creado_por?: string | null
          editado_at?: string
          editado_por?: string | null
          id?: string
          texto?: string
          titulo?: string | null
          version?: number
        }
        Relationships: []
      }
      perfiles: {
        Row: {
          creado_at: string
          debe_cambiar_clave: boolean
          estado: string
          id: string
          nombre: string | null
          rol: string
        }
        Insert: {
          creado_at?: string
          debe_cambiar_clave?: boolean
          estado?: string
          id: string
          nombre?: string | null
          rol?: string
        }
        Update: {
          creado_at?: string
          debe_cambiar_clave?: boolean
          estado?: string
          id?: string
          nombre?: string | null
          rol?: string
        }
        Relationships: []
      }
      prompt_base: {
        Row: {
          editado_at: string
          editado_por: string | null
          id: string
          texto: string
          unica: boolean
          version: number
        }
        Insert: {
          editado_at?: string
          editado_por?: string | null
          id?: string
          texto: string
          unica?: boolean
          version?: number
        }
        Update: {
          editado_at?: string
          editado_por?: string | null
          id?: string
          texto?: string
          unica?: boolean
          version?: number
        }
        Relationships: []
      }
      reglas_agente: {
        Row: {
          activo: boolean
          editado_at: string
          editado_por: string | null
          id: string
          numero: number
          texto: string
          version: number
        }
        Insert: {
          activo?: boolean
          editado_at?: string
          editado_por?: string | null
          id?: string
          numero: number
          texto: string
          version?: number
        }
        Update: {
          activo?: boolean
          editado_at?: string
          editado_por?: string | null
          id?: string
          numero?: number
          texto?: string
          version?: number
        }
        Relationships: []
      }
      solicitudes_acceso: {
        Row: {
          estado: string
          id: string
          perfil_id: string
          resuelto_at: string | null
          resuelto_por: string | null
          rol_solicitado: string | null
          solicitado_at: string
        }
        Insert: {
          estado?: string
          id?: string
          perfil_id: string
          resuelto_at?: string | null
          resuelto_por?: string | null
          rol_solicitado?: string | null
          solicitado_at?: string
        }
        Update: {
          estado?: string
          id?: string
          perfil_id?: string
          resuelto_at?: string | null
          resuelto_por?: string | null
          rol_solicitado?: string | null
          solicitado_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_acceso_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_acceso_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      turnos: {
        Row: {
          aviso: string | null
          aviso_ok_at: string | null
          aviso_ok_por: string | null
          cancelado_at: string | null
          cliente_id: string
          confirmado: boolean
          confirmado_at: string | null
          confirmado_por: string | null
          creado_at: string
          devuelto_at: string | null
          duracion_min: number
          editado_at: string
          editado_por: string | null
          estado: string
          fin: string
          google_event_id: string | null
          id: string
          inicio: string
          motivo_cancelacion: string | null
          probador: number
          recordatorio_enviado_at: string | null
          tipo: string
          urgencia: boolean
          version: number
        }
        Insert: {
          aviso?: string | null
          aviso_ok_at?: string | null
          aviso_ok_por?: string | null
          cancelado_at?: string | null
          cliente_id: string
          confirmado?: boolean
          confirmado_at?: string | null
          confirmado_por?: string | null
          creado_at?: string
          devuelto_at?: string | null
          duracion_min: number
          editado_at?: string
          editado_por?: string | null
          estado?: string
          fin: string
          google_event_id?: string | null
          id?: string
          inicio: string
          motivo_cancelacion?: string | null
          probador: number
          recordatorio_enviado_at?: string | null
          tipo: string
          urgencia?: boolean
          version?: number
        }
        Update: {
          aviso?: string | null
          aviso_ok_at?: string | null
          aviso_ok_por?: string | null
          cancelado_at?: string | null
          cliente_id?: string
          confirmado?: boolean
          confirmado_at?: string | null
          confirmado_por?: string | null
          creado_at?: string
          devuelto_at?: string | null
          duracion_min?: number
          editado_at?: string
          editado_por?: string | null
          estado?: string
          fin?: string
          google_event_id?: string | null
          id?: string
          inicio?: string
          motivo_cancelacion?: string | null
          probador?: number
          recordatorio_enviado_at?: string | null
          tipo?: string
          urgencia?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "turnos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      turnos_por_avisar: {
        Row: {
          aviso: string | null
          aviso_ok_at: string | null
          aviso_ok_por: string | null
          cancelado_at: string | null
          cliente_id: string | null
          confirmado: boolean | null
          confirmado_at: string | null
          confirmado_por: string | null
          creado_at: string | null
          devuelto_at: string | null
          duracion_min: number | null
          editado_at: string | null
          editado_por: string | null
          estado: string | null
          fin: string | null
          google_event_id: string | null
          id: string | null
          inicio: string | null
          motivo_cancelacion: string | null
          probador: number | null
          recordatorio_enviado_at: string | null
          tipo: string | null
          urgencia: boolean | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "turnos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjunto_reintentar: { Args: { p_mensaje: string }; Returns: Json }
      agenda_trabar_fecha: { Args: { p_fecha: string }; Returns: undefined }
      analista_relevo: {
        Args: { p_fecha: string; p_relevo: number }
        Returns: undefined
      }
      atencion_resolver: {
        Args: { p_accion: string; p_conversacion: string }
        Returns: Json
      }
      bandeja_marcar_leida: {
        Args: { p_conversacion: string; p_mensajes: string[] }
        Returns: number
      }
      bandeja_no_leidos: {
        Args: { p_ids: string[] }
        Returns: {
          cantidad: number
          conversacion_id: string
        }[]
      }
      cambiar_rol: {
        Args: { p_perfil: string; p_rol: string }
        Returns: {
          creado_at: string
          debe_cambiar_clave: boolean
          estado: string
          id: string
          nombre: string | null
          rol: string
        }
        SetofOptions: {
          from: "*"
          to: "perfiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cola_absorber: {
        Args: { p_hasta: string; p_trabajo: string }
        Returns: number
      }
      cola_derivar_por_fallo: {
        Args: { p_conversacion: string; p_detalle: string }
        Returns: undefined
      }
      cola_rescatar_trabados: { Args: never; Returns: number }
      cola_terminar: {
        Args: { p_error?: string; p_id: string; p_ok: boolean }
        Returns: undefined
      }
      cola_tomar_uno: {
        Args: { p_worker: string }
        Returns: {
          conversacion_id: string
          creado_at: string
          estado: string
          id: string
          intentos: number
          payload: Json
          procesado_at: string | null
          reintentar_despues_de: string | null
          respondido_at: string | null
          tomado_at: string | null
          tomado_por: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "cola_trabajos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      completar_alta_admin: {
        Args: { p_perfil: string }
        Returns: {
          creado_at: string
          debe_cambiar_clave: boolean
          estado: string
          id: string
          nombre: string | null
          rol: string
        }
        SetofOptions: {
          from: "*"
          to: "perfiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      conversacion_abierta_de: { Args: { p_cliente: string }; Returns: string }
      correccion_descartar: { Args: { p_correccion: string }; Returns: boolean }
      corrector_aplicar: {
        Args: { p_correccion: string; p_hash_archivo: string; p_quien: string }
        Returns: Json
      }
      corrector_rechazar: {
        Args: { p_correccion: string; p_motivo: string }
        Returns: boolean
      }
      crear_invitacion: {
        Args: { p_email: string; p_rol: string }
        Returns: {
          creado_at: string
          email: string
          invitado_por: string | null
          rol: string
          usado_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invitaciones_acceso"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dar_ok_aviso_turno: { Args: { p_turno: string }; Returns: Json }
      despertar_worker: { Args: never; Returns: undefined }
      envio_disponible: {
        Args: { p_referencia: string; p_tipo: string }
        Returns: boolean
      }
      envio_reservar: {
        Args: {
          p_cliente: string
          p_plantilla: string
          p_referencia: string
          p_tipo: string
        }
        Returns: string
      }
      envio_terminar: {
        Args: {
          p_error?: string
          p_id: string
          p_ok: boolean
          p_texto: string
          p_wa_message_id: string
        }
        Returns: undefined
      }
      envios_pendientes: {
        Args: { p_ahora?: string; p_tipo: string; p_tz: string }
        Returns: {
          cliente_id: string
          inicio: string
          nombre: string
          referencia: string
          telefono: string
        }[]
      }
      es_admin: { Args: never; Returns: boolean }
      es_usuario_aprobado: { Args: never; Returns: boolean }
      forzar_cambio_clave: {
        Args: { p_perfil: string }
        Returns: {
          creado_at: string
          debe_cambiar_clave: boolean
          estado: string
          id: string
          nombre: string | null
          rol: string
        }
        SetofOptions: {
          from: "*"
          to: "perfiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      instrucciones_volver: { Args: { p_version?: number }; Returns: Json }
      mostrador_enviar: {
        Args: { p_conversacion: string; p_texto: string }
        Returns: Json
      }
      mostrador_enviar_audio: {
        Args: { p_conversacion: string; p_storage_path: string }
        Returns: Json
      }
      mostrador_enviar_foto: {
        Args: {
          p_conversacion: string
          p_epigrafe?: string
          p_storage_path: string
        }
        Returns: Json
      }
      negocio_tz: { Args: never; Returns: string }
      prompt_normalizar_contexto: { Args: { p_valor: string }; Returns: string }
      prompt_reglas_numeradas: { Args: never; Returns: string }
      prompt_sin_comentarios: { Args: { p_texto: string }; Returns: string }
      prompt_vigente: { Args: never; Returns: string }
      registrar_mensaje_entrante: {
        Args: {
          p_contenido: string
          p_crudo: Json
          p_enviado_at: string
          p_nombre: string
          p_telefono: string
          p_tipo: string
          p_wa_message_id: string
        }
        Returns: boolean
      }
      resolver_solicitud: {
        Args: { p_aprobar: boolean; p_rol?: string; p_solicitud: string }
        Returns: {
          estado: string
          id: string
          perfil_id: string
          resuelto_at: string | null
          resuelto_por: string | null
          rol_solicitado: string | null
          solicitado_at: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_acceso"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revocar_sesiones: { Args: { p_perfil: string }; Returns: undefined }
      terminar_cambio_clave: { Args: never; Returns: undefined }
      turno_confirmar_por_boton: {
        Args: { p_conversacion: string; p_turno: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

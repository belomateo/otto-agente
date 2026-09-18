// Tipos de la base (schema public), generados con `supabase gen types typescript` contra el
// proyecto real: la base es una sola y la comparten los cuatro roles, así que esto refleja
// también migraciones de otros roles ya aplicadas (p. ej. mostrador_enviar, 0028 de logica).
// No se editan a mano: si cambia el esquema, se regeneran (CLAUDE.md § 7: no hay vistas
// tipadas a mano). Excepción puntual (16/9): mensajes.no_enviado_motivo (0042 de logica) se
// sumó a mano porque el CLI (`gen types --db-url`) falla acá por Docker Desktop inalcanzable,
// no por la base; verificado contra el esquema real (information_schema, pg_constraint) antes
// de escribirlo. Se reemplaza solo con regenerar de verdad en cuanto Docker ande. Mismo motivo,
// mismo día: catalogo_alquiler.orden (0044), turnos.urgencia (0046) y la función
// mostrador_enviar_foto (0028-bis de logica, todavía sin aplicar cuando se escribió esto: la
// firma es la que avisó por chat, no está verificada contra la base todavía).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      clientes: {
        Row: {
          actualizado_at: string
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
          editado_at: string
          editado_por: string | null
          escalonado_min: number
          id: string
          unica: boolean
          version: number
        }
        Insert: {
          aviso_turno_min?: number | null
          cantidad_probadores: number
          dias_reserva_urgencia?: number | null
          editado_at?: string
          editado_por?: string | null
          escalonado_min: number
          id?: string
          unica?: boolean
          version?: number
        }
        Update: {
          aviso_turno_min?: number | null
          cantidad_probadores?: number
          dias_reserva_urgencia?: number | null
          editado_at?: string
          editado_por?: string | null
          escalonado_min?: number
          id?: string
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
          id: string
          iniciado_at: string
          ultimo_mensaje_at: string | null
        }
        Insert: {
          canal?: string
          cliente_id: string
          estado?: string
          id?: string
          iniciado_at?: string
          ultimo_mensaje_at?: string | null
        }
        Update: {
          canal?: string
          cliente_id?: string
          estado?: string
          id?: string
          iniciado_at?: string
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
          contenido: string | null
          conversacion_id: string
          direccion: string
          enviado_at: string
          id: string
          no_enviado_motivo: string | null
          tipo: string
          wa_message_id: string | null
        }
        Insert: {
          contenido?: string | null
          conversacion_id: string
          direccion: string
          enviado_at?: string
          id?: string
          no_enviado_motivo?: string | null
          tipo?: string
          wa_message_id?: string | null
        }
        Update: {
          contenido?: string | null
          conversacion_id?: string
          direccion?: string
          enviado_at?: string
          id?: string
          no_enviado_motivo?: string | null
          tipo?: string
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
        }
        Insert: {
          autor: string
          cliente_id: string
          creado_at?: string
          id?: string
          texto: string
        }
        Update: {
          autor?: string
          cliente_id?: string
          creado_at?: string
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
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
          estado: string
          id: string
          nombre: string | null
          rol: string
        }
        Insert: {
          creado_at?: string
          estado?: string
          id: string
          nombre?: string | null
          rol?: string
        }
        Update: {
          creado_at?: string
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
          solicitado_at: string
        }
        Insert: {
          estado?: string
          id?: string
          perfil_id: string
          resuelto_at?: string | null
          resuelto_por?: string | null
          solicitado_at?: string
        }
        Update: {
          estado?: string
          id?: string
          perfil_id?: string
          resuelto_at?: string | null
          resuelto_por?: string | null
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
      atencion_resolver: {
        Args: { p_accion: string; p_conversacion: string }
        Returns: Json
      }
      cola_absorber: {
        Args: { p_hasta: string; p_trabajo: string }
        Returns: number
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
      conversacion_abierta_de: { Args: { p_cliente: string }; Returns: string }
      dar_ok_aviso_turno: { Args: { p_turno: string }; Returns: Json }
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
      immutable_unaccent: { Args: { "": string }; Returns: string }
      mostrador_enviar: {
        Args: { p_conversacion: string; p_texto: string }
        Returns: Json
      }
      mostrador_enviar_foto: {
        Args: { p_conversacion: string; p_epigrafe?: string | null; p_storage_path: string }
        Returns: Json
      }
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
          solicitado_at: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitudes_acceso"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
  public: {
    Enums: {},
  },
} as const


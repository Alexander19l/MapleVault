# Cuarentena

**Nada de lo que hay en este directorio está activo.** Los archivos aquí no son cargados por Claude
Code: no son agentes, no son skills, no son hooks. Están guardados para que alguien los revise.

## Qué entra aquí

Cualquier candidato upstream que, aunque sea útil, incluya o requiera:

- hooks ejecutables (`hooks.json`, scripts asociados);
- shell scripts, PowerShell, Python o Node ejecutable;
- un servidor MCP;
- acceso de red no declarado;
- lectura de credenciales, `.env`, claves SSH o credenciales cloud;
- auto-modificación o auto-ejecución;
- instalación automática de paquetes;
- procesos en segundo plano;
- bypass o relajación de permisos.

## Qué NO significa estar aquí

No significa que el componente sea malicioso. Significa que **activarlo es una decisión del usuario,
no del agente**, porque amplía privilegios o introduce ejecución de terceros.

## Cómo sacar algo de aquí

1. Revisarlo línea a línea.
2. Entender qué ejecuta, cuándo y con qué permisos.
3. Decidir explícitamente activarlo.
4. Registrarlo en `../registry/decisions.md` con el motivo.
5. Moverlo a su ubicación real.

## Estado actual

Vacío. Ningún componente upstream llegó a descargarse en forma ejecutable: la revisión de ECC y
Hermes se hizo leyendo archivos concretos por API, sin clonar los repositorios.

Componentes identificados como candidatos a cuarentena **si alguna vez se descargan**:

| Componente | Origen | Motivo |
|---|---|---|
| `hooks/` completo | ECC | hooks ejecutables |
| `install.sh`, `install.ps1` | ECC | instaladores |
| `.mcp.json`, `mcp-configs/` | ECC | servidores MCP |
| `ecc_dashboard.py` | ECC | Python ejecutable (41 KB) |
| `setup-hermes.sh` | Hermes | instalador (18 KB) |
| `trajectory_compressor.py` | Hermes | Python ejecutable (70 KB) |
| `mcp_serve.py`, `gateway/` | Hermes | MCP y servicio de red |
| `security-guidance/hooks/` | plugin oficial | ~400 KB de Python en eventos de sesión |

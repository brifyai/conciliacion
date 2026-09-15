import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  DataGrid,
  GridToolbar,
  type GridColDef,
  type GridRenderCellParams,
  type GridRowSelectionModel,
} from '@mui/x-data-grid'
import { esES } from '@mui/x-data-grid/locales'
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded'
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded'
import { useSnackbar } from 'notistack'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/common/PageHeader'
import { DialogInspeccionIA } from './DialogInspeccionIA'
import { StatusBadge } from '@/components/common/StatusBadge'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import { formatCLP, formatDateCL, formatPercent } from '@/lib/format'
import { formatRUT } from '@/lib/rut'
import { transaccionesDelPeriodo, etiquetaPeriodo } from '@/lib/periodo'
import type { EstadoTransaccion, Transaccion } from '@/types/conciliacion'

const FILTROS: { value: EstadoTransaccion | 'todas'; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'conciliada', label: 'Conciliadas' },
  { value: 'resuelta', label: 'Resueltas' },
  { value: 'sugerida', label: 'Sugeridas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'no_conciliada', label: 'No conciliadas' },
]

export function ConciliacionPage() {
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const todasLasTransacciones = useConciliacionStore((s) => s.transacciones)
  const codigos = useConciliacionStore((s) => s.codigos)
  const periodo = useConciliacionStore((s) => s.periodo)
  const conciliarManual = useConciliacionStore((s) => s.conciliarManual)
  const desconciliar = useConciliacionStore((s) => s.desconciliar)
  const marcarResueltas = useConciliacionStore((s) => s.marcarResueltas)
  const revertirResuelta = useConciliacionStore((s) => s.revertirResuelta)
  const actualizarTransaccion = useConciliacionStore((s) => s.actualizarTransaccion)
  const cargando = useConciliacionStore((s) => s.cargando)

  const transacciones = transaccionesDelPeriodo(todasLasTransacciones, periodo)
  const noHayDatosDelPeriodo =
    transacciones.length === 0 && todasLasTransacciones.length > 0

  const [filtro, setFiltro] = useState<EstadoTransaccion | 'todas'>('todas')
  const [seleccion, setSeleccion] = useState<GridRowSelectionModel>([])
  const [buscadorDe, setBuscadorDe] = useState<Transaccion | null>(null)
  const [inspeccionDe, setInspeccionDe] = useState<Transaccion | null>(null)

  const filas = useMemo(
    () => (filtro === 'todas' ? transacciones : transacciones.filter((t) => t.estado === filtro)),
    [transacciones, filtro],
  )

  const seleccionadas = transacciones.filter((t) => seleccion.includes(t.id))
  const puedeMatchManual =
    seleccionadas.length === 2 &&
    seleccionadas.some((t) => t.fuente === 'banco') &&
    seleccionadas.some((t) => t.fuente === 'contabilidad')
  // Resolver por clasificación: movimientos bancarios sin contraparte, con código.
  const puedeResolver =
    seleccionadas.length > 0 &&
    seleccionadas.every(
      (t) => t.fuente === 'banco' && t.estado !== 'conciliada' && t.estado !== 'resuelta',
    )
  // Todos los movimientos del banco del período, con código y sin conciliar.
  const bancoResolvibles = transacciones.filter(
    (t) => t.fuente === 'banco' && t.estado === 'no_conciliada' && t.codigoId && t.monto !== 0,
  )

  const handleMatchSeleccion = async () => {
    const [a, b] = seleccionadas
    try {
      await conciliarManual(a.id, b.id)
      enqueueSnackbar('Transacciones conciliadas manualmente.', { variant: 'success' })
      setSeleccion([])
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo conciliar.', { variant: 'error' })
    }
  }

  const handleDesconciliar = async (id: string) => {
    try {
      await desconciliar(id)
      enqueueSnackbar('Match desvinculado.', { variant: 'info' })
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo desvincular.', { variant: 'error' })
    }
  }

  const handleMarcarResueltas = async () => {
    const sinCodigo = seleccionadas.filter((t) => !t.codigoId)
    if (sinCodigo.length > 0) {
      enqueueSnackbar(
        'Asigna un código contable antes de marcar como resuelto (justifica el movimiento).',
        { variant: 'warning' },
      )
      return
    }
    try {
      await marcarResueltas(seleccionadas.map((t) => t.id))
      enqueueSnackbar(`${seleccionadas.length} movimiento(s) marcados como resueltos.`, { variant: 'success' })
      setSeleccion([])
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo resolver.', { variant: 'error' })
    }
  }

  const handleResolverTodasBanco = async () => {
    if (bancoResolvibles.length === 0) return
    try {
      await marcarResueltas(bancoResolvibles.map((t) => t.id))
      enqueueSnackbar(
        `${bancoResolvibles.length} movimiento(s) del banco marcados como resueltos por su código.`,
        { variant: 'success' },
      )
      setSeleccion([])
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo resolver.', { variant: 'error' })
    }
  }

  const handleRevertirResuelta = async (id: string) => {
    try {
      await revertirResuelta(id)
      enqueueSnackbar('Movimiento devuelto a no conciliado.', { variant: 'info' })
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo revertir.', { variant: 'error' })
    }
  }

  const handleEditarCategoria = (id: string, nuevaCategoria: string) => {
    actualizarTransaccion(id, { categoria: nuevaCategoria || undefined })
    enqueueSnackbar('Categoría actualizada.', { variant: 'success' })
  }

  const handleAsignarCodigo = (tx: Transaccion, codigoId: string) => {
    if (!codigoId) {
      actualizarTransaccion(tx.id, {
        codigoId: undefined,
        codigoOrigen: undefined,
        codigoConfianza: undefined,
        codigoEvidencia: undefined,
      })
      enqueueSnackbar('Código contable removido.', { variant: 'info' })
      return
    }
    const codigo = codigos.find((item) => item.id === codigoId)
    if (!codigo) return
    actualizarTransaccion(tx.id, {
      codigoId: codigo.id,
      codigoOrigen: 'manual',
      codigoConfianza: 1,
      codigoEvidencia: 'Asignado manualmente',
      categoria: codigo.categoria ?? tx.categoria,
    })
    enqueueSnackbar(`Código ${codigo.id} asignado.`, { variant: 'success' })
  }

  const columnas: GridColDef[] = [
    { field: 'fecha', headerName: 'Fecha', width: 110, valueFormatter: (v) => formatDateCL(String(v)) },
    {
      field: 'fechaVencimiento',
      headerName: 'Vencimiento',
      width: 120,
      valueFormatter: (v) => (v ? formatDateCL(String(v)) : '—'),
    },
    {
      field: 'fuente',
      headerName: 'Origen',
      width: 130,
      renderCell: (p: GridRenderCellParams<Transaccion>) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Chip
            size="small"
            label={p.row.fuente === 'banco' ? p.row.banco ?? 'Banco' : 'Contabilidad'}
            variant="outlined"
            color={p.row.fuente === 'banco' ? 'primary' : 'secondary'}
          />
        </Box>
      ),
    },
    { field: 'descripcion', headerName: 'Descripción / Glosa', flex: 1, minWidth: 220 },
    {
      field: 'rut',
      headerName: 'RUT',
      width: 130,
      valueFormatter: (v) => (v ? formatRUT(String(v)) : '—'),
    },
    {
      field: 'monto',
      headerName: 'Monto',
      width: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (v) => formatCLP(Number(v)),
      renderCell: (p: GridRenderCellParams<Transaccion>) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: '100%' }}>
          <Typography
            sx={{
              fontWeight: 600,
              color: p.row.monto >= 0 ? 'success.main' : 'error.main',
            }}
          >
            {formatCLP(p.row.monto)}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'codigoId',
      headerName: 'Código contable',
      width: 250,
      sortable: true,
      renderCell: (p: GridRenderCellParams<Transaccion>) => {
        const seleccionado = codigos.find((codigo) => codigo.id === p.row.codigoId)
        const detalle = p.row.codigoOrigen
          ? `Origen: ${p.row.codigoOrigen} · Confianza: ${formatPercent(p.row.codigoConfianza ?? 0)}${p.row.codigoEvidencia ? ` · ${p.row.codigoEvidencia}` : ''}`
          : 'Sin código asignado'
        return (
          <Tooltip title={detalle}>
            <Select
              size="small"
              value={p.row.codigoId ?? ''}
              displayEmpty
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => handleAsignarCodigo(p.row, String(event.target.value))}
              renderValue={() => seleccionado
                ? `${seleccionado.clave ? `${seleccionado.clave} · ` : ''}${seleccionado.id} · ${seleccionado.nombre}`
                : 'Sin código'}
              sx={{ width: '100%', fontSize: 12, height: 34 }}
            >
              <MenuItem value="">Sin código</MenuItem>
              {codigos.filter((codigo) => codigo.activo).map((codigo) => (
                <MenuItem key={codigo.id} value={codigo.id}>
                  {codigo.clave ? `${codigo.clave} · ` : ''}{codigo.id} · {codigo.nombre}
                </MenuItem>
              ))}
            </Select>
          </Tooltip>
        )
      },
    },
    {
      field: 'categoria',
      headerName: 'Categoría',
      width: 180,
      editable: true,
      type: 'string',
    },
    {
      field: 'confianza',
      headerName: 'Confianza',
      width: 110,
      renderCell: (p: GridRenderCellParams<Transaccion>) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          {p.row.confianza !== undefined ? (
            <Typography variant="caption" color="text.secondary">
              {formatPercent(p.row.confianza)}
            </Typography>
          ) : (
            '—'
          )}
        </Box>
      ),
    },
    {
      field: 'estado',
      headerName: 'Estado',
      width: 150,
      renderCell: (p: GridRenderCellParams<Transaccion>) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <StatusBadge estado={p.row.estado} />
        </Box>
      ),
    },
    {
      field: 'acciones',
      headerName: '',
      width: 160,
      sortable: false,
      disableColumnMenu: true,
      renderCell: (p: GridRenderCellParams<Transaccion>) => (
        <Stack direction="row" spacing={0.5} sx={{ height: '100%', alignItems: 'center' }}>
          <Tooltip title="Buscar contraparte">
            <IconButton size="small" onClick={() => setBuscadorDe(p.row)}>
              <SearchRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {p.row.estado !== 'conciliada' && p.row.estado !== 'resuelta' && (
            <Tooltip
              title={
                p.row.estado === 'sugerida'
                  ? 'Inspeccionar con IA'
                  : 'Analizar con IA por qué no se concilió'
              }
            >
              <IconButton size="small" color="primary" onClick={() => setInspeccionDe(p.row)}>
                <AutoAwesomeRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {p.row.estado === 'conciliada' && (
            <Tooltip title="Desconciliar">
              <IconButton size="small" color="error" onClick={() => handleDesconciliar(p.row.id)}>
                <LinkOffRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {p.row.estado === 'resuelta' && (
            <Tooltip title="Revertir resolución">
              <IconButton size="small" color="warning" onClick={() => handleRevertirResuelta(p.row.id)}>
                <LinkOffRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ]

  if (noHayDatosDelPeriodo) {
    return (
      <Box>
        <PageHeader
          title="Tabla de conciliación"
          subtitle="Revisa, filtra y concilia transacciones entre el banco y la contabilidad."
        />
        <Card>
          <CardContent>
            <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
              <EventBusyRoundedIcon sx={{ fontSize: 56, color: 'warning.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Mes sin data
              </Typography>
              <Typography variant="body2" color="text.secondary" align="center">
                No hay transacciones para <strong>{etiquetaPeriodo(periodo)}</strong>.
                <br />
                Selecciona otro período o carga un extracto bancario desde el menú <em>Carga</em>.
              </Typography>
              <Button
                variant="contained"
                startIcon={<UploadFileRoundedIcon />}
                onClick={() => navigate('/carga')}
              >
                Cargar cartola
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    )
  }

  if (transacciones.length === 0) {
    return (
      <Box>
        <PageHeader
          title="Tabla de conciliación"
          subtitle="Revisa, filtra y concilia transacciones entre el banco y la contabilidad."
        />
        <Card>
          <CardContent>
            <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
              <UploadFileRoundedIcon sx={{ fontSize: 56, color: 'text.secondary' }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Sin transacciones cargadas
              </Typography>
              <Typography variant="body2" color="text.secondary" align="center">
                Carga tu extracto bancario y tu libro contable para empezar a conciliar.
              </Typography>
              <Button
                variant="contained"
                startIcon={<UploadFileRoundedIcon />}
                onClick={() => navigate('/carga')}
              >
                Cargar datos
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    )
  }

  return (
    <Box>
      <PageHeader
        title="Tabla de conciliación"
        subtitle="Revisa, filtra y concilia transacciones entre el banco y la contabilidad."
        actions={
          <Stack direction="row" spacing={1}>
            {puedeResolver ? (
              <Tooltip title="Marca los movimientos del banco seleccionados (sin contraparte) como resueltos por su código.">
                <span>
                  <Button variant="outlined" onClick={handleMarcarResueltas}>
                    Marcar resueltas ({seleccionadas.length})
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Tooltip title="Marca de una vez todos los movimientos del banco del período que ya tienen código pero no calzaron con un documento (cobros/pagos agrupados, factoring, tesorería). Quedan como 'Resuelta', distinguibles de las conciliadas.">
                <span>
                  <Button
                    variant="outlined"
                    disabled={bancoResolvibles.length === 0}
                    onClick={handleResolverTodasBanco}
                  >
                    Resolver banco codificado ({bancoResolvibles.length})
                  </Button>
                </span>
              </Tooltip>
            )}
            <Button
              variant="contained"
              disabled={!puedeMatchManual}
              onClick={handleMatchSeleccion}
            >
              Conciliar selección ({seleccionadas.length})
            </Button>
          </Stack>
        }
      />

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        {FILTROS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            color={filtro === f.value ? 'primary' : 'default'}
            variant={filtro === f.value ? 'filled' : 'outlined'}
            onClick={() => setFiltro(f.value)}
          />
        ))}
      </Stack>

      <Box sx={{ height: 620, width: '100%', bgcolor: 'background.paper', borderRadius: 2 }}>
        <DataGrid
          rows={filas}
          columns={columnas}
          loading={cargando}
          getRowId={(r) => r.id}
          checkboxSelection
          disableRowSelectionOnClick
          rowSelectionModel={seleccion}
          onRowSelectionModelChange={setSeleccion}
          localeText={esES.components.MuiDataGrid.defaultProps.localeText}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 200 } },
          }}
          onRowDoubleClick={(params) => setBuscadorDe(params.row as Transaccion)}
          processRowUpdate={(newRow, oldRow) => {
            const row = newRow as Transaccion
            const anterior = oldRow as Transaccion
            if (row.categoria !== anterior.categoria) {
              handleEditarCategoria(row.id, row.categoria ?? '')
            }
            return row
          }}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            '& .MuiDataGrid-columnHeaders': { borderRadius: '8px 8px 0 0' },
          }}
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            columns: { columnVisibilityModel: { categoria: true } },
            sorting: { sortModel: [{ field: 'fecha', sort: 'asc' }] },
          }}
        />
      </Box>

      <DialogBuscarMatch
        origen={buscadorDe}
        candidatos={buscadorDe ? transacciones.filter((t) => t.fuente !== buscadorDe.fuente && t.estado !== 'conciliada') : []}
        onClose={() => setBuscadorDe(null)}
        onConfirmar={async (id) => {
          if (!buscadorDe) return
          try {
            await conciliarManual(buscadorDe.id, id)
            enqueueSnackbar('Conciliación manual realizada.', { variant: 'success' })
            setBuscadorDe(null)
          } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo conciliar.', { variant: 'error' })
          }
        }}
      />

      <DialogInspeccionIA
        transaccion={inspeccionDe}
        codigos={codigos}
        onClose={() => setInspeccionDe(null)}
        onConfirmar={async (tx) => {
          if (!tx.matchId) return
          try {
            await conciliarManual(tx.id, tx.matchId)
            enqueueSnackbar('Conciliación confirmada.', { variant: 'success' })
            setInspeccionDe(null)
          } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo conciliar.', { variant: 'error' })
          }
        }}
      />
    </Box>
  )
}

function DialogBuscarMatch({
  origen,
  candidatos,
  onClose,
  onConfirmar,
}: {
  origen: Transaccion | null
  candidatos: Transaccion[]
  onClose: () => void
  onConfirmar: (id: string) => Promise<void>
}) {
  return (
    <Dialog open={!!origen} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Buscar contraparte
        {origen && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {origen.descripcion} · {formatCLP(origen.monto)} · {formatDateCL(origen.fecha)}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1} sx={{ mt: 1, maxHeight: 400, overflow: 'auto' }}>
          {candidatos.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No hay candidatos disponibles en la fuente contraria.
            </Typography>
          )}
          {candidatos.map((c) => (
            <Stack
              key={c.id}
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              spacing={1}
              sx={{
                p: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                '&:hover': { borderColor: 'primary.main', bgcolor: '#F5F8FF' },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>{c.descripcion}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDateCL(c.fecha)} · {formatCLP(c.monto)}
                  {c.rut ? ` · ${formatRUT(c.rut)}` : ''}
                </Typography>
              </Box>
              <Button size="small" variant="contained" onClick={() => onConfirmar(c.id)}>
                Vincular
              </Button>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
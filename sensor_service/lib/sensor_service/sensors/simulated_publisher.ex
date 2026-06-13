defmodule SensorService.Sensors.SimulatedPublisher do
  @moduledoc """
  GenServer that simulates an MQTT soil-moisture sensor feed.

  Every ~2 seconds it generates a plausible soil-moisture reading for each
  seeded sensor node and **publishes it to the MQTT broker** via
  `SensorService.MQTT.PublisherClient`. The broker then delivers the message
  to the `SensorService.MQTT.Subscriber`, which calls `insert_reading/1` —
  the single point of persistence and PubSub broadcast.

  On first start (empty sensor_nodes table) the publisher queries the shared
  parcels table for the first parcel and seeds 10 nodes spread across the demo
  ortho footprint near lat 39.269, lng -86.576 (± ~0.0015°). If no parcel
  exists yet, seeding is skipped and re-attempted on each subsequent tick.

  Supervised under `SensorService.Application` (not started in `:test` env).
  """

  use GenServer
  require Logger

  alias SensorService.Repo
  alias SensorService.Sensors
  alias SensorService.MQTT.PublisherClient

  @interval_ms 2_000
  @depth_bands ["0-4in", "4-8in", "8-12in"]

  # Offsets (Δlat, Δlng) in degrees, spread across the ortho footprint.
  @node_offsets [
    {0.0000, 0.0000},
    {0.0010, 0.0005},
    {-0.0010, 0.0005},
    {0.0010, -0.0005},
    {-0.0010, -0.0005},
    {0.0005, 0.0013},
    {-0.0005, 0.0013},
    {0.0005, -0.0013},
    {-0.0005, -0.0013},
    {0.0015, 0.0000}
  ]

  @base_lat 39.269
  @base_lng -86.576

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  @doc "Start the publisher, supervised."
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Trigger one publish cycle immediately (useful for smoke tests)."
  @spec publish_now() :: :ok
  def publish_now do
    GenServer.call(__MODULE__, :publish_now)
  end

  # ---------------------------------------------------------------------------
  # GenServer callbacks
  # ---------------------------------------------------------------------------

  @impl true
  def init(_opts) do
    nodes = ensure_seed_nodes()
    schedule_tick()
    {:ok, %{nodes: nodes}}
  end

  @impl true
  def handle_info(:tick, %{nodes: nodes} = state) do
    nodes = if nodes == [], do: ensure_seed_nodes(), else: nodes
    emit_readings(nodes)
    schedule_tick()
    {:noreply, %{state | nodes: nodes}}
  end

  @impl true
  def handle_call(:publish_now, _from, %{nodes: nodes} = state) do
    emit_readings(nodes)
    {:reply, :ok, state}
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp schedule_tick do
    jitter = :rand.uniform(400) - 200
    Process.send_after(self(), :tick, @interval_ms + jitter)
  end

  defp ensure_seed_nodes do
    existing = Sensors.list_nodes()

    if existing != [] do
      existing
    else
      case fetch_first_parcel_id() do
        nil ->
          Logger.warning("SimulatedPublisher: no parcel found in shared DB — skipping seed")
          []

        parcel_id ->
          seed_nodes_for_parcel(parcel_id)
      end
    end
  end

  defp fetch_first_parcel_id do
    case Repo.query("SELECT id FROM parcels ORDER BY created_at LIMIT 1") do
      {:ok, %{rows: [[id | _] | _]}} ->
        to_string(id)

      {:ok, %{rows: []}} ->
        nil

      {:error, err} ->
        Logger.error("SimulatedPublisher: parcels query failed: #{inspect(err)}")
        nil
    end
  end

  defp seed_nodes_for_parcel(parcel_id) do
    Logger.info("SimulatedPublisher: seeding 10 nodes for parcel #{parcel_id}")

    @node_offsets
    |> Enum.with_index(1)
    |> Enum.map(fn {{dlat, dlng}, idx} ->
      label = :io_lib.format("Node ~2..0B", [idx]) |> IO.iodata_to_binary()

      attrs = %{
        parcel_id: parcel_id,
        label: label,
        lat: Float.round(@base_lat + dlat, 6),
        lng: Float.round(@base_lng + dlng, 6)
      }

      case Sensors.insert_node(attrs) do
        {:ok, node} ->
          Logger.info("SimulatedPublisher: seeded #{node.label} (id=#{node.id})")
          node

        {:error, cs} ->
          Logger.error("SimulatedPublisher: failed to seed node: #{inspect(cs.errors)}")
          nil
      end
    end)
    |> Enum.reject(&is_nil/1)
  end

  # Publishes one reading per node×band to the MQTT broker via PublisherClient.
  # The broker delivers it back to the Subscriber, which calls insert_reading/1.
  defp emit_readings(nodes) do
    for node <- nodes, depth_band <- @depth_bands do
      value = Float.round(15.0 + :rand.uniform() * 50.0, 2)
      at = DateTime.utc_now()

      case PublisherClient.publish(node.id, depth_band, value, at) do
        :ok ->
          :ok

        {:error, reason} ->
          Logger.warning(
            "SimulatedPublisher: publish failed for node #{node.id}/#{depth_band}: #{inspect(reason)}"
          )
      end
    end
  end
end

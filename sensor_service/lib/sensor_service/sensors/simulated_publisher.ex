defmodule SensorService.Sensors.SimulatedPublisher do
  @moduledoc """
  GenServer that simulates an MQTT soil-moisture feed.

  Every ~2 seconds it generates a plausible soil-moisture reading for each
  seeded sensor node, inserts it via `SensorService.Sensors.insert_reading/1`,
  and lets PubSub fan-out handle the channel broadcast.

  This stands in for a real MQTT broker adapter (tracked as a future issue).
  Replace this module with an `emqtt`/`tortoise` client when the broker arrives.

  The publisher is supervised under `SensorService.Application`.
  """

  use GenServer
  require Logger

  alias SensorService.Sensors

  @interval_ms 2_000
  # Spike seed nodes — created once on first start if the table is empty.
  @seed_nodes [
    %{
      parcel_id: "00000000-0000-0000-0000-000000000001",
      label: "Node A",
      lat: 38.5449,
      lng: -121.7405
    },
    %{
      parcel_id: "00000000-0000-0000-0000-000000000001",
      label: "Node B",
      lat: 38.5452,
      lng: -121.7412
    }
  ]
  @depth_bands ["0-4in", "4-8in", "8-12in"]

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  @doc "Start the publisher, supervised."
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Trigger one publish cycle immediately (used in tests)."
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
    emit_readings(nodes)
    schedule_tick()
    {:noreply, state}
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
    # Add jitter (±200 ms) so bursts don't always align in tests.
    jitter = :rand.uniform(400) - 200
    Process.send_after(self(), :tick, @interval_ms + jitter)
  end

  defp ensure_seed_nodes do
    existing = Sensors.list_nodes()

    if existing == [] do
      Enum.map(@seed_nodes, fn attrs ->
        case Sensors.insert_node(attrs) do
          {:ok, node} ->
            Logger.info("SimulatedPublisher: seeded node #{node.label} (id=#{node.id})")
            node

          {:error, cs} ->
            Logger.error("SimulatedPublisher: failed to seed node: #{inspect(cs.errors)}")
            nil
        end
      end)
      |> Enum.reject(&is_nil/1)
    else
      existing
    end
  end

  defp emit_readings(nodes) do
    for node <- nodes, depth_band <- @depth_bands do
      attrs = %{
        node_id: node.id,
        at: DateTime.utc_now(),
        depth_band: depth_band,
        # Soil moisture 15–65 % VWC — plausible for irrigated ag.
        value: Float.round(15.0 + :rand.uniform() * 50.0, 2)
      }

      case Sensors.insert_reading(attrs) do
        {:ok, _reading} ->
          :ok

        {:error, cs} ->
          Logger.warning("SimulatedPublisher: insert_reading failed: #{inspect(cs.errors)}")
      end
    end
  end
end

defmodule SensorService.Sensors do
  @moduledoc """
  Sensors context — the public API for the sensor domain.

  Owns sensor_nodes and sensor_readings in the shared Postgres DB.
  Call `insert_reading/1` to persist a reading and fan-out via PubSub
  (used by both the simulated publisher and, later, the MQTT adapter).
  """

  import Ecto.Query
  alias SensorService.Repo
  alias SensorService.Sensors.{SensorNode, SensorReading}

  # ---------------------------------------------------------------------------
  # Nodes
  # ---------------------------------------------------------------------------

  @doc "Insert a new sensor node. Returns `{:ok, node}` or `{:error, changeset}`."
  @spec insert_node(map()) :: {:ok, SensorNode.t()} | {:error, Ecto.Changeset.t()}
  def insert_node(attrs) do
    %SensorNode{}
    |> SensorNode.changeset(attrs)
    |> Repo.insert()
  end

  @doc "List all sensor nodes."
  @spec list_nodes() :: [SensorNode.t()]
  def list_nodes, do: Repo.all(SensorNode)

  @doc "List nodes for a given parcel_id (binary UUID string)."
  @spec nodes_for_parcel(String.t()) :: [SensorNode.t()]
  def nodes_for_parcel(parcel_id) do
    Repo.all(from n in SensorNode, where: n.parcel_id == ^parcel_id)
  end

  # ---------------------------------------------------------------------------
  # Readings
  # ---------------------------------------------------------------------------

  @doc """
  Insert a reading and broadcast it on PubSub topic `sensors:<parcel_id>`.

  The broadcast payload is a plain map so the channel can forward it as JSON.
  Returns `{:ok, reading}` or `{:error, changeset}`.
  """
  @spec insert_reading(map()) :: {:ok, SensorReading.t()} | {:error, Ecto.Changeset.t()}
  def insert_reading(attrs) do
    with {:ok, reading} <-
           %SensorReading{}
           |> SensorReading.changeset(attrs)
           |> Repo.insert(),
         {:ok, node} <- fetch_node(reading.node_id) do
      payload = %{
        node_id: reading.node_id,
        depth_band: reading.depth_band,
        value: reading.value,
        at: DateTime.to_iso8601(reading.at)
      }

      Phoenix.PubSub.broadcast(
        SensorService.PubSub,
        "sensors:#{node.parcel_id}",
        {:sensor_reading, payload}
      )

      {:ok, reading}
    end
  end

  @doc "Return the 100 most-recent readings for a node."
  @spec recent_readings(integer(), pos_integer()) :: [SensorReading.t()]
  def recent_readings(node_id, limit \\ 100) do
    Repo.all(
      from r in SensorReading,
        where: r.node_id == ^node_id,
        order_by: [desc: r.at],
        limit: ^limit
    )
  end

  # ---------------------------------------------------------------------------
  # Internal helpers
  # ---------------------------------------------------------------------------

  defp fetch_node(node_id) do
    case Repo.get(SensorNode, node_id) do
      nil -> {:error, :node_not_found}
      node -> {:ok, node}
    end
  end
end

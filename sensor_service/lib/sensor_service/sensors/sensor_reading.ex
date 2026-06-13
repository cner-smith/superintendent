defmodule SensorService.Sensors.SensorReading do
  @moduledoc """
  Schema for a single soil-moisture reading from a sensor node.

  depth_band is a string label such as "0-4in" or "4-8in".
  value is the raw sensor float (e.g. volumetric water content percentage).
  at is UTC microsecond precision — important for preserving MQTT packet
  timestamps when the real broker integration arrives.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @type t :: %__MODULE__{}

  schema "sensor_readings" do
    field :at, :utc_datetime_usec
    field :depth_band, :string
    field :value, :float

    belongs_to :node, SensorService.Sensors.SensorNode
  end

  @doc "Changeset for inserting a new reading."
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(reading, attrs) do
    reading
    |> cast(attrs, [:node_id, :at, :depth_band, :value])
    |> validate_required([:node_id, :at, :depth_band, :value])
    |> assoc_constraint(:node)
  end
end

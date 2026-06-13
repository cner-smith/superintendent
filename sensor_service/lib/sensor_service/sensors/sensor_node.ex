defmodule SensorService.Sensors.SensorNode do
  @moduledoc """
  Schema for a physical sensor node deployed in a parcel.

  Each node has a geographic position (lat/lng floats for the spike;
  production target is geometry(Point,4326) via geo_postgis).
  parcel_id is a logical foreign key to the Drizzle/TS parcels table —
  no DB constraint since it crosses service boundaries.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @type t :: %__MODULE__{}

  schema "sensor_nodes" do
    field :parcel_id, Ecto.UUID
    field :label, :string
    field :lat, :float
    field :lng, :float

    has_many :readings, SensorService.Sensors.SensorReading, foreign_key: :node_id

    timestamps(type: :utc_datetime_usec)
  end

  @doc "Changeset for creating or updating a sensor node."
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(node, attrs) do
    node
    |> cast(attrs, [:parcel_id, :label, :lat, :lng])
    |> validate_required([:parcel_id, :label, :lat, :lng])
    |> validate_number(:lat, greater_than_or_equal_to: -90, less_than_or_equal_to: 90)
    |> validate_number(:lng, greater_than_or_equal_to: -180, less_than_or_equal_to: 180)
  end
end

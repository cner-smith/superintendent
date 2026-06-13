defmodule SensorService.Repo.Migrations.CreateSensorNodes do
  use Ecto.Migration

  @doc """
  Creates the sensor_nodes table.

  lat/lng stored as plain floats for the spike.
  Production target: geometry(Point,4326) via geo_postgis extension.
  parcel_id references the parcels table owned by the Drizzle/TS side
  (no FK constraint — cross-service reference, enforced at app layer).
  """
  def change do
    create table(:sensor_nodes) do
      add :parcel_id, :uuid, null: false
      add :label, :string, null: false
      add :lat, :float, null: false
      add :lng, :float, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:sensor_nodes, [:parcel_id])
  end
end

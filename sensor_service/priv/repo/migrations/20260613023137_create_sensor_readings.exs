defmodule SensorService.Repo.Migrations.CreateSensorReadings do
  use Ecto.Migration

  @doc """
  Creates the sensor_readings table.

  depth_band is a string label e.g. "0-4in", "4-8in".
  value is the raw sensor float (soil moisture %, volts, etc.).
  at is UTC microsecond precision to preserve MQTT packet timestamps.
  """
  def change do
    create table(:sensor_readings) do
      add :node_id, references(:sensor_nodes, on_delete: :delete_all), null: false
      add :at, :utc_datetime_usec, null: false
      add :depth_band, :string, null: false
      add :value, :float, null: false
    end

    create index(:sensor_readings, [:node_id])
    create index(:sensor_readings, [:at])
  end
end

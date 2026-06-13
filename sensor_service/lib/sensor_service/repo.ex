defmodule SensorService.Repo do
  use Ecto.Repo,
    otp_app: :sensor_service,
    adapter: Ecto.Adapters.Postgres
end

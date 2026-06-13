defmodule SensorService.MQTT.Client do
  @moduledoc """
  Supervised Tortoise311 connection for the sensor subscriber.

  Reads host/port from application config (`:sensor_service, :mqtt`), which
  defaults to `localhost:1883`. In `:test` env the process is not started
  (controlled by `SensorService.Application`).

  The connection subscribes to `superintendent/sensors/+/+` and delegates
  incoming messages to `SensorService.MQTT.Subscriber`.
  """

  @subscribe_topic "superintendent/sensors/+/+"
  @client_id "sensor_service_subscriber"

  @doc "Child spec for the Tortoise311 connection supervisor."
  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(_opts) do
    {host, port} = mqtt_config()

    Tortoise311.Connection.child_spec(
      client_id: @client_id,
      handler: {SensorService.MQTT.Subscriber, []},
      server: {Tortoise311.Transport.Tcp, host: host, port: port},
      subscriptions: [{@subscribe_topic, 0}]
    )
    |> Map.put(:id, __MODULE__)
  end

  defp mqtt_config do
    cfg = Application.get_env(:sensor_service, :mqtt, [])
    host = Keyword.get(cfg, :host, "localhost") |> to_charlist()
    port = Keyword.get(cfg, :port, 1883)
    {host, port}
  end
end

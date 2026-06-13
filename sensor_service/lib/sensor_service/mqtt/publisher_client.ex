defmodule SensorService.MQTT.PublisherClient do
  @moduledoc """
  Supervised Tortoise311 connection used by `SimulatedPublisher` to publish
  readings to the MQTT broker.

  A separate client from the subscriber avoids loopback filtering issues on
  some brokers and keeps concerns separated. In `:test` env this process is
  not started.
  """

  @client_id "sensor_service_publisher"

  @doc "Child spec for the Tortoise311 connection supervisor."
  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(_opts) do
    {host, port} = mqtt_config()

    Tortoise311.Connection.child_spec(
      client_id: @client_id,
      handler: {Tortoise311.Handler.Default, []},
      server: {Tortoise311.Transport.Tcp, host: host, port: port},
      subscriptions: []
    )
    |> Map.put(:id, __MODULE__)
  end

  @doc "Publish a JSON payload to a sensor topic. Fire-and-forget (QoS 0)."
  @spec publish(String.t(), String.t(), float(), DateTime.t()) :: :ok
  def publish(node_id, depth_band, value, at) do
    topic = "superintendent/sensors/#{node_id}/#{depth_band}"

    payload =
      Jason.encode!(%{
        "value" => value,
        "at" => DateTime.to_iso8601(at)
      })

    Tortoise311.publish(@client_id, topic, payload, qos: 0)
  end

  defp mqtt_config do
    cfg = Application.get_env(:sensor_service, :mqtt, [])
    host = Keyword.get(cfg, :host, "localhost") |> to_charlist()
    port = Keyword.get(cfg, :port, 1883)
    {host, port}
  end
end

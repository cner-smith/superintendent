defmodule SensorService.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    base_children = [
      SensorServiceWeb.Telemetry,
      SensorService.Repo,
      {DNSCluster, query: Application.get_env(:sensor_service, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: SensorService.PubSub},
      SensorServiceWeb.Endpoint
    ]

    children =
      if Application.get_env(:sensor_service, :start_mqtt, true) do
        # MQTT subscriber — connects to broker and calls insert_reading/1 on arrival.
        # MQTT publisher client — used by SimulatedPublisher to emit readings.
        # SimulatedPublisher — seeds nodes and publishes via MQTT every ~2 s.
        mqtt_children = [
          SensorService.MQTT.Client,
          SensorService.MQTT.PublisherClient,
          SensorService.Sensors.SimulatedPublisher
        ]

        base_children ++ mqtt_children
      else
        base_children
      end

    opts = [strategy: :one_for_one, name: SensorService.Supervisor]
    Supervisor.start_link(children, opts)
  end

  @impl true
  def config_change(changed, _new, removed) do
    SensorServiceWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end

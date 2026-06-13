defmodule SensorServiceWeb.SensorsChannel do
  @moduledoc """
  Phoenix Channel for real-time sensor telemetry fan-out.

  Topic format: `sensors:<parcel_id>`.

  On join the channel returns the current state as the ok-reply payload:

      {
        "nodes": [
          {"id": 1, "label": "Node 01", "lat": 39.269, "lng": -86.576,
           "depth_bands": ["0-4in","4-8in","8-12in"]}
        ],
        "readings": [
          {"node_id": 1, "depth_band": "0-4in", "value": 42.5, "at": "2026-06-12T...Z"}
        ]
      }

  After joining, clients receive `new_reading` push events whenever a reading is
  inserted for any node in that parcel.  Payload shape:

      {"node_id": integer, "depth_band": string, "value": float, "at": ISO8601}
  """

  use Phoenix.Channel

  alias SensorService.Sensors

  @depth_bands ["0-4in", "4-8in", "8-12in"]

  @impl true
  def join("sensors:" <> parcel_id = topic, _params, socket) do
    Phoenix.PubSub.subscribe(SensorService.PubSub, topic)

    nodes = Sensors.list_nodes(parcel_id)
    readings = Sensors.latest_readings(parcel_id)

    node_payloads =
      Enum.map(nodes, fn n ->
        %{
          id: n.id,
          label: n.label,
          lat: n.lat,
          lng: n.lng,
          depth_bands: @depth_bands
        }
      end)

    reply = %{nodes: node_payloads, readings: readings}
    {:ok, reply, socket}
  end

  @impl true
  def handle_info({:sensor_reading, payload}, socket) do
    push(socket, "new_reading", payload)
    {:noreply, socket}
  end
end

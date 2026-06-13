defmodule SensorServiceWeb.SensorsChannel do
  @moduledoc """
  Phoenix Channel for real-time sensor telemetry fan-out.

  Topic format: `sensors:<parcel_id>` (use `sensors:lobby` for spike/testing).

  Clients join with `channel.join("sensors:<parcel_id>", {})` and receive
  `new_reading` push events whenever a reading is inserted for any node in
  that parcel.

  The channel subscribes to the matching PubSub topic on join so that
  `SensorService.Sensors.insert_reading/1` broadcasts reach all connected
  WebSocket clients automatically.
  """

  use Phoenix.Channel

  @impl true
  def join("sensors:" <> _parcel_id = topic, _params, socket) do
    # Subscribe to the matching PubSub topic so handle_info forwards pushes.
    Phoenix.PubSub.subscribe(SensorService.PubSub, topic)
    {:ok, socket}
  end

  @impl true
  def handle_info({:sensor_reading, payload}, socket) do
    push(socket, "new_reading", payload)
    {:noreply, socket}
  end
end

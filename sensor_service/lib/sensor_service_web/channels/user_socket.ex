defmodule SensorServiceWeb.UserSocket do
  @moduledoc """
  WebSocket entry point for sensor telemetry subscriptions.

  React clients connect here to subscribe to sensor channels.
  Authentication (token-based) is deferred to a future issue —
  for the spike the socket is open.
  """

  use Phoenix.Socket

  channel "sensors:*", SensorServiceWeb.SensorsChannel

  @impl true
  def connect(_params, socket, _connect_info) do
    {:ok, socket}
  end

  @impl true
  def id(_socket), do: nil
end

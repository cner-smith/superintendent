defmodule SensorServiceWeb.SensorsChannelTest do
  @moduledoc """
  Spike tests proving the realtime path:

  1. A client that joins sensors:<parcel_id> receives a `new_reading` push
     whenever a reading is inserted for a node in that parcel.
  2. Readings are persisted — the DB row exists after insert.
  """

  use SensorServiceWeb.ChannelCase, async: false

  alias SensorService.Sensors
  alias SensorService.Repo
  alias SensorService.Sensors.SensorReading

  @parcel_id "00000000-0000-0000-0000-000000000099"

  setup do
    {:ok, node} =
      Sensors.insert_node(%{
        parcel_id: @parcel_id,
        label: "Test Node",
        lat: 38.5,
        lng: -121.7
      })

    {:ok, socket} = connect(SensorServiceWeb.UserSocket, %{}, connect_info: %{})
    {:ok, _reply, socket} = subscribe_and_join(socket, "sensors:#{@parcel_id}", %{})

    %{node: node, socket: socket}
  end

  test "broadcast: subscriber receives new_reading push on insert", %{node: node} do
    at = DateTime.utc_now()

    {:ok, _reading} =
      Sensors.insert_reading(%{
        node_id: node.id,
        at: at,
        depth_band: "0-4in",
        value: 42.5
      })

    assert_push "new_reading", %{
      node_id: node_id,
      depth_band: "0-4in",
      value: 42.5
    }

    assert node_id == node.id
  end

  test "persistence: reading row exists in DB after insert", %{node: node} do
    at = DateTime.utc_now()

    {:ok, reading} =
      Sensors.insert_reading(%{
        node_id: node.id,
        at: at,
        depth_band: "4-8in",
        value: 27.3
      })

    persisted = Repo.get(SensorReading, reading.id)
    assert persisted != nil
    assert persisted.depth_band == "4-8in"
    assert_in_delta persisted.value, 27.3, 0.001
    assert persisted.node_id == node.id
  end

  test "broadcast payload contains iso8601 at timestamp", %{node: node} do
    at = DateTime.utc_now()

    {:ok, _reading} =
      Sensors.insert_reading(%{
        node_id: node.id,
        at: at,
        depth_band: "8-12in",
        value: 19.0
      })

    assert_push "new_reading", %{at: at_str}
    assert {:ok, _, _} = DateTime.from_iso8601(at_str)
  end
end

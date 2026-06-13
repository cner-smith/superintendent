defmodule SensorService.MQTT.SubscriberTest do
  @moduledoc """
  Unit tests for the MQTT subscriber's ingest logic.

  Tests call `SensorService.MQTT.Subscriber.handle_inbound/2` directly —
  no live broker or Tortoise311 connection is required.
  """

  use SensorService.DataCase, async: false

  alias SensorService.MQTT.Subscriber
  alias SensorService.Sensors
  alias SensorService.Repo
  alias SensorService.Sensors.SensorReading

  @parcel_id "00000000-0000-0000-0000-000000000042"

  setup do
    {:ok, node} =
      Sensors.insert_node(%{
        parcel_id: @parcel_id,
        label: "MQTT Test Node",
        lat: 39.269,
        lng: -86.576
      })

    %{node: node}
  end

  test "valid topic + payload persists a reading and returns :ok", %{node: node} do
    at = DateTime.utc_now() |> DateTime.truncate(:second)
    payload = Jason.encode!(%{"value" => 42.1, "at" => DateTime.to_iso8601(at)})

    topic_levels = ["superintendent", "sensors", to_string(node.id), "0-4in"]
    assert :ok = Subscriber.handle_inbound(topic_levels, payload)

    readings =
      Repo.all(
        from r in SensorReading,
          where: r.node_id == ^node.id and r.depth_band == "0-4in"
      )

    assert length(readings) == 1
    assert_in_delta hd(readings).value, 42.1, 0.001
  end

  test "correct depth_band is stored", %{node: node} do
    at = DateTime.utc_now() |> DateTime.truncate(:second)
    payload = Jason.encode!(%{"value" => 27.5, "at" => DateTime.to_iso8601(at)})

    topic_levels = ["superintendent", "sensors", to_string(node.id), "8-12in"]
    assert :ok = Subscriber.handle_inbound(topic_levels, payload)

    [reading] =
      Repo.all(
        from r in SensorReading,
          where: r.node_id == ^node.id and r.depth_band == "8-12in"
      )

    assert reading.depth_band == "8-12in"
  end

  test "malformed payload returns :skip and does not persist", %{node: node} do
    topic_levels = ["superintendent", "sensors", to_string(node.id), "4-8in"]
    assert :skip = Subscriber.handle_inbound(topic_levels, "not-json")

    assert Repo.all(
             from r in SensorReading,
               where: r.node_id == ^node.id and r.depth_band == "4-8in"
           ) == []
  end

  test "payload missing 'value' field returns :skip", %{node: node} do
    payload = Jason.encode!(%{"at" => DateTime.to_iso8601(DateTime.utc_now())})
    topic_levels = ["superintendent", "sensors", to_string(node.id), "0-4in"]
    assert :skip = Subscriber.handle_inbound(topic_levels, payload)
  end

  test "payload missing 'at' field returns :skip", %{node: node} do
    payload = Jason.encode!(%{"value" => 33.3})
    topic_levels = ["superintendent", "sensors", to_string(node.id), "0-4in"]
    assert :skip = Subscriber.handle_inbound(topic_levels, payload)
  end

  test "non-integer node_id in topic returns :skip" do
    payload =
      Jason.encode!(%{"value" => 10.0, "at" => DateTime.to_iso8601(DateTime.utc_now())})

    topic_levels = ["superintendent", "sensors", "not-an-int", "0-4in"]
    assert :skip = Subscriber.handle_inbound(topic_levels, payload)
  end

  test "wrong topic structure returns :skip" do
    assert :skip = Subscriber.handle_inbound(["other", "topic"], "whatever")
  end

  test "nil payload returns :skip", %{node: node} do
    topic_levels = ["superintendent", "sensors", to_string(node.id), "0-4in"]
    assert :skip = Subscriber.handle_inbound(topic_levels, nil)
  end
end

using System.ComponentModel.DataAnnotations;

namespace HORUSPDV_API.Models.Requests;

public sealed class CreateRestaurantTableRequest
{
    [Required, StringLength(80, MinimumLength = 1)]
    public string Name { get; set; } = "";

    [Range(1, 100)]
    public int Capacity { get; set; } = 4;
}

public sealed class OpenRestaurantTabRequest
{
    [Required, StringLength(40)]
    public string TableId { get; set; } = "";

    [StringLength(180)]
    public string CustomerName { get; set; } = "Consumidor";

    [Range(1, 999)]
    public int GuestCount { get; set; } = 1;

    [StringLength(500)]
    public string Notes { get; set; } = "";
}

public sealed class AddRestaurantTabItemRequest
{
    [Required, StringLength(40)]
    public string ProductId { get; set; } = "";

    [Range(typeof(decimal), "0.001", "999999999")]
    public decimal Quantity { get; set; } = 1;

    [StringLength(500)]
    public string Notes { get; set; } = "";
}

public sealed class UpdateRestaurantTabItemStatusRequest
{
    [Required]
    [RegularExpression("pending|preparing|ready|delivered|cancelled")]
    public string Status { get; set; } = "pending";
}
